var express = require('express');
var blockchain = require("../lib/blockchain");
var router = express.Router();
var config = require("./config");
var request = require("request");

var https = require("https");

var twilio = undefined;
var twilioAccountSID = process.env.TWILIO_ACCOUNT_SID;
var twilioAuth = process.env.TWILIO_AUTH_TOKEN;
var NUMBERS = process.env.NUMBERS;
var FROM_NUMBER = process.env.FROM_NUMBER;

if (twilioAccountSID && twilioAuth) {
    twilio = require("twilio")(twilioAccountSID, twilioAuth);
}

var SMS_SERVICEID = config.smsService || "SMSID";
var SLACK_SERVICEID = config.slackService || "SLACKID";
var ALARM_ID = config.alarmService || "ALARMID";

var BUTTON_DEVICE_ID =  config.deviceAddress;
var SERVICEID = config.serviceAddress;


router.post("/action", function (req, res, next)  {
    var device_id = BUTTON_DEVICE_ID;

    raiseAlarm(device_id);
    return res.status(200).send("OK");
});
router.get("/action", function (req, res, next)  {
    var device_id = BUTTON_DEVICE_ID;

    raiseAlarm(device_id);

    return res.status(200).send("OK");
});

function raiseAlarm(deviceId, next) {
    if (!deviceId) {
        return next({message: "deviceId is required."});
    }

    blockchain.whoOwnsDevice({deviceID: deviceId}, function (err, owner) {
        if (err) {
            return next(err);
        }
        var args = {
            owner: owner,
            action: "BOOL",
            serviceAddress: SERVICEID
        };
        blockchain.getConsumers(args, function (err, devices) {
            if (err) {
                console.error(err);
                return;
            }

            console.log("GETCONSUMERS", devices);

            if (devices.indexOf(ALARM_ID) > -1) {
                soundAlarm();
            }
        });

        args.action = "TEXT";
        blockchain.getConsumers(args, function (err, devices) {
            if (err) {
                console.error(err);
                return;
            }
            console.log("GETCONSUMERS", devices);

            var textArgs = {message: "Your loved one has had a fall.  Better call Saul."};
            textArgs.message = process.env.TEXT_MESSAGE || textArgs.message;


            if (devices.indexOf(SMS_SERVICEID) > -1) {
                sendSMS(textArgs);
            }
            if (devices.indexOf(SLACK_SERVICEID) > -1) {
                textArgs.id = process.env.SLACK_TOKEN;

                callSlack(textArgs, function () {
                    console.log("called slack");
                });
            }
        });
    });
}

function soundAlarm() {
    console.log("I'm' sounding the alarm");
    var postData = JSON.stringify({ 'percent': 100, 'duration_ms': 2000 });

    var postOptions = {
        host: 'api-http.littlebitscloud.cc',
        port: 443,
        path: '/v2/devices/00e04c02cba4/output',
        method: 'POST',
        headers: {
            'Authorization': 'Bearer 5fc3e2e92182b4f3c10796adad5d84db3505022e0a3f0d25dfccb308f18c2304',
            'Content-Type': 'application/json'
        }
    };

    var postRequest = https.request(postOptions, function(res) {
        // res.setEncoding('utf-8');
        res.on('data', function (data) {
            console.log('Posting Result:\n');
            process.stdout.write(data);
            console.log('\n\nPOST Operation Completed');
        });
        res.on('error', function (e) {
            console.error(e);
        });
    });

    postRequest.write(postData);
    postRequest.end();
    postRequest.on('error', function (e) {
        console.error(e);
    });
}

function callSlack(args, next) {

    if (!args) {
        return next({message: "args is required."});
    }
    if (!args.id) {
        return next({message: "args.id is required."});
    }
    if (!args.message) {
        return next({message: "args.message is required."});
    }

    var postData = JSON.stringify( {"text": args.message});

    var postOptions = {
        host: 'hooks.slack.com',
        port: 443,
        path: '/services/' + args.id,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var postRequest = https.request(postOptions, function(res) {
        res.on('data', function (data) {
            next(null, data)
        });
        res.on('error', function (e) {
            next(e, null)
        });
    });

    postRequest.write(postData);
    postRequest.end();
    postRequest.on('error', function (e) {
        next(e, null)
    });
}

function sendSlack(args) {
    console.log("I'm' sending slack");

    request("https://slack.com/api/chat.postMessage?token=xoxp-108095108048-108170107008-133766850867-43cf077c44138b23beb66587e5c92f21&pretty=1&channel=C363Q8Q1X&text=" + encodeURIComponent(args.message));
}

function sendSMS(args) {
    console.log("I'm' sending sms");
    if(twilio && NUMBERS) {
        var numbers = NUMBERS.split(",");
        numbers = numbers.map(function (num) {
            return num.trim();
        });

        for (var i = 0; i < numbers.length; i++) {
            var number = numbers[i];
            twilio.messages.create({
                to: number,
                from: FROM_NUMBER,
                body: args.message,
            }, function(err, message) {
                if (err) {
                    console.error(err);
                    return;
                }
                if (message) {
                    console.log(message.sid);
                }
            });
        }
    }
}

module.exports = router;
