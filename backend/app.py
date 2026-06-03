import datetime
import time
from collections import defaultdict
import sys
from flask import Flask, jsonify, request, Response, stream_with_context
import random
import string
import os
import json
import shutil
from flask_cors import CORS
from threading import Lock

route_locks = defaultdict(Lock)
last_broadcast = defaultdict(lambda: 0.0)
route_sse_streams = defaultdict(dict)

DEFAULT_LIST = [{"name": "Default", "todos": []}]
app = Flask(__name__)
app.config["REDIS_URL"] = "redis://localhost:6379/0"
CORS(app, resources={r"/*": {"origins": "*"}})

DATA_DIR = "data"  # Directory for all route data

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)


def validate_route(route):
    return len(route) <= 16 and all(map(lambda c: c.isalnum(), route))


def generate_route():
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(8))


def rotate_backups(route_dir):
    current_file = os.path.join(route_dir, "current.json")
    if not os.path.exists(current_file):
        return
    for i in range(5, 0, -1):
        src = os.path.join(route_dir, f"current.bak.{i - 1}" if i > 1 else "current.json")
        dst = os.path.join(route_dir, f"current.bak.{i}")
        if os.path.exists(src):
            if os.path.exists(dst):
                os.remove(dst)
            shutil.move(src, dst)


def save_lists(route, lists):
    route_dir = os.path.join(DATA_DIR, route)
    if not os.path.exists(route_dir):
        os.makedirs(route_dir)
    rotate_backups(route_dir)
    current_file = os.path.join(route_dir, "current.json")
    with open(current_file, "w") as f:
        json.dump(lists, f)


def load_lists(route):
    route_dir = os.path.join(DATA_DIR, route)
    current_file = os.path.join(route_dir, "current.json")
    if os.path.exists(current_file):
        with open(current_file, "r") as f:
            return json.load(f)
    default_lists = DEFAULT_LIST
    save_lists(route, default_lists)
    return default_lists


def log_request_to_file(log_file, route):
    log_entry = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "ip": request.remote_addr,
        "method": request.method,
        "route": route,
        "user_agent": request.headers.get("User-Agent", "Unknown"),
        "headers": dict(request.headers),
        "body": request.get_json(silent=True)
    }
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry) + "\n")


def log_request(route):
    log_file = os.path.join(DATA_DIR, route, "requests.log")
    log_request_to_file(log_file, route)


def log_invalid_request(route):
    log_file = os.path.join(DATA_DIR, "invalid_requests.log")
    log_request_to_file(log_file, route)


def create_new_route(route_dir):
    os.makedirs(route_dir)


@app.route("/<route>/updates")
def sse_stream(route):
    client_id = request.args.get('client_id')
    print(f"Client {client_id} registering for updates on {route}", file=sys.stderr)
    if not client_id:
        log_invalid_request(route)
        return jsonify({"error": "Client-ID required"}), 400

    # Ensure client has a list to receive updates
    route_sse_streams[route][client_id] = []

    def event_stream():
        try:
            while True:
                if route_sse_streams[route][client_id]:
                    message = route_sse_streams[route][client_id].pop(0)
                    yield f"data: {message}\n\n"
                time.sleep(1)
        except GeneratorExit:
            print(f"Client {client_id} disconnected", file=sys.stderr)
            del route_sse_streams[route][client_id]

    return Response(stream_with_context(event_stream()), status=200, content_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


@app.route('/new', methods=['GET'])
def new_route():
    route = generate_route()
    route_dir = os.path.join(DATA_DIR, route)
    while os.path.exists(route_dir):
        route = generate_route()
        route_dir = os.path.join(DATA_DIR, route)
    create_new_route(route_dir)
    log_request(route)
    default_lists = DEFAULT_LIST
    save_lists(route, default_lists)
    print(f"Generated new route: {route}", file=sys.stderr)
    return jsonify({"route": route})


@app.route('/<route>', methods=['GET'])
def get_todo_lists(route):
    if not validate_route(route):
        log_invalid_request(route)
        return jsonify({"error": "Invalid route"}), 400
    route_dir = os.path.join(DATA_DIR, route)
    if not os.path.exists(route_dir):
        create_new_route(route_dir)
    log_request(route)
    lists = load_lists(route)
    return jsonify(lists)


@app.route('/<route>', methods=['PUT'])
def update_todo_lists(route):
    if not validate_route(route):
        log_invalid_request(route)
        return jsonify({"error": "Invalid route"}), 400
    client_id = request.headers.get('X-Client-ID')
    if not client_id:
        log_invalid_request(route)
        return jsonify({"error": "Client-ID required"}), 400
    with route_locks[route]:
        log_request(route)
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({"error": "Invalid data format"}), 400

        save_lists(route, data)
        print(f"{len(route_sse_streams[route].keys())} clients registered for {route}. Pushing update notification by "
              f"{client_id}", file=sys.stderr)

        for sse_client in route_sse_streams[route].keys():
            print(f"Publishing update notification to {sse_client} (update from {client_id})", file=sys.stderr)
            route_sse_streams[route][sse_client].append(json.dumps({"clientID": client_id}))

    return jsonify({"status": "saved"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4434, debug=True)
