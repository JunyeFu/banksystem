import os
import hashlib
import hmac
import json
import time
from flask import Flask, request, jsonify

app = Flask(__name__)

CALLBACK_SECRET = os.environ.get("CLEARING_CALLBACK_SECRET", "")
BANK_CHANNEL_URL = os.environ.get("BANK_CHANNEL_URL", "http://bank-channel-service:8080")

SCENARIOS = {
    "SUCCESS_IMMEDIATE", "SUCCESS_DELAYED", "REJECT_ACCOUNT_INVALID",
    "REJECT_BANK_UNAVAILABLE", "TIMEOUT_THEN_SUCCESS", "TIMEOUT_THEN_FAIL",
    "RETURN_AFTER_SETTLEMENT", "DUPLICATE_CALLBACK", "OUT_OF_ORDER_CALLBACK",
}


def sign_payload(payload):
    body = json.dumps(payload, sort_keys=True).encode()
    return hmac.new(CALLBACK_SECRET.encode(), body, hashlib.sha256).hexdigest()


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "UP", "service": "mock-clearing-service"}), 200


@app.route("/clearing/send", methods=["POST"])
def send_clearing():
    data = request.get_json(force=True)
    scenario = data.get("scenario", "SUCCESS_IMMEDIATE")

    if scenario not in SCENARIOS:
        return jsonify({
            "type": "urn:bank:error:invalid-scenario",
            "title": "Unknown clearing scenario",
            "status": 400,
            "code": "CLEARING_INVALID_SCENARIO",
        }), 400

    clearing_ref = f"CLR-{int(time.time() * 1000)}"

    if scenario == "REJECT_ACCOUNT_INVALID":
        return jsonify({
            "clearingReference": clearing_ref,
            "status": "REJECTED",
            "failureCode": "ACCOUNT_INVALID",
            "failureDetail": "Beneficiary account does not exist at target bank",
        }), 200

    if scenario == "REJECT_BANK_UNAVAILABLE":
        return jsonify({
            "clearingReference": clearing_ref,
            "status": "REJECTED",
            "failureCode": "BANK_UNAVAILABLE",
            "failureDetail": "Target bank is not available",
        }), 200

    return jsonify({
        "clearingReference": clearing_ref,
        "status": "ACCEPTED",
        "scenario": scenario,
    }), 202


@app.route("/clearing/callback", methods=["POST"])
def trigger_callback():
    return jsonify({"status": "CALLBACK_QUEUED"}), 202


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
