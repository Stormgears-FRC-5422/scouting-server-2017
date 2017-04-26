/**
 * Created by andrew on 1/24/17.
 */
const Client = require("hangupsjs");
const Schema = require("hangupsjs/lib/schema");
const Q = require("q");
const protobuf = require("protobufjs");
const RandExp = require("randexp");
const baseX = require("base-x");
const google = require("googleapis");
const googleAuth = require("google-auth-library");
const express = require("express");
const bodyParser = require("body-parser");
// const compression = require("compression");
require('dotenv').config();

const creds = function () {
	return {
		auth: () => process.env.GOOGLE_OAUTH_TOKEN // https://github.com/tdryer/hangups/issues/260#issuecomment-246578670
	};
};

const app = express();
// app.use(compression());
app.use(bodyParser.urlencoded());
app.use(bodyParser.raw({
	inflate: true,
	limit: '100kb',
	type: 'application/x-protobuf'
}));

const client = new Client({
	tokenPersistence: {
		save: function (token) {
			return new Promise((resolve, reject) => {
				// TODO
				console.log("TODO: Save refresh token: " + token);
			});
		},
		load: function () {
			return new Promise((resolve, reject) => {
				console.log("loading refresh token");
				resolve(process.env.GOOGLE_REFRESH_TOKEN);
			});
		}
	},
	rtokenpath: "refresh-token.txt",
	cookiespath: "cookies.json"
});
client.loglevel("info");

const randomReplier = new RandExp(/([Tt]hank(s| you)|(([Gg]ot it|O[kK]|ok)(,? (thanks|thank you))?))(\.|!{1,3}|)/);
const base94 = baseX("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~!@#$%^&*()_+`-=[]\\{}|;':\",./<>?");
const Event = protobuf.loadSync("scoutingdata.proto").lookup("Event");


// authorize Google Sheets
const auth = new googleAuth();
let authClient;
auth.getApplicationDefault(function (err, auth) {
	if (err) {
		console.log('Authentication failed because of ', err);
		process.exit(1);
	}

	console.log("Got service account auth");

	if (auth.createScopedRequired && auth.createScopedRequired()) {
		const scopes = ['https://spreadsheets.google.com/feeds'];
		auth = auth.createScoped(scopes);
	}

	authClient = auth;
});

const sheets = google.sheets("v4");

client.on("chat_message", function (ev) {
	// get the original message text
	let messageText = "";
	// let messageText = ev.chat_message.message_content.segment[0].text;
	ev.chat_message.message_content.segment.forEach(function (seg) {
		messageText += seg.text.trim();
	});

	// console.log(messageText);

	messageText = messageText.replace(/\s+/g, "");

	if (!messageText.match(/^STORMGEARS_SCOUT/)) {
		return;
	}
	console.log(messageText);
	messageText = messageText.substring("STORMGEARS_SCOUT".length).trim();

	const decoded = base94.decode(messageText);
	const message = Event.decode(decoded).toObject();
	console.log(message);

	delete message.password;

	sendToSheet(message, function (err, res) {
		if (err) {
			console.error(err);
			client.sendchatmessage(ev.conversation_id.id, [[0, "Oh no! Something went wrong!"]], null, null, null, [Schema.ClientDeliveryMediumType.GOOGLE_VOICE]);
			return;
		}

		client.sendchatmessage(ev.conversation_id.id, [[0, randomReplier.gen()]], null, null, null, [Schema.ClientDeliveryMediumType.GOOGLE_VOICE]); // only supports Google Voice
	})
});

app.post("/", function (req, res) {
	console.log("Got HTTP message");

	let message;
	let isWebInterface = false;
	if (req.header("Content-Type") === "application/x-protobuf") {
		message = Event.decode(req.body).toObject();
	} else {
		message = req.body;
		isWebInterface = true;

		// FIXME: This is insecure!
		if (message.password !== process.env.SUBMISSION_PASSWORD) {
			return res.redirect("/#invalid_password_status");
			// return res.status(403).send("Invalid password.");
		}

		message.mAutoPercentShotsMissed = Math.round((message.mAutoLowShots + message.mAutoHighShots) / 20 * 100);
		message.mAutoCrossedBaseline = message.mAutoCrossedBaseline === "on";
		message.mTeleAirshipReadyForTakeoff = message.mTeleAirshipReadyForTakeoff === "on";
	}

	delete message.password;

	console.log(message);

	sendToSheet(message, function (err, reso) {
		if (err) {
			console.error(err);
			if (isWebInterface) {
				return res.redirect("/#error_status");
			} else {
				return res.status(500).send("An error occurred");
			}
		}

		if (isWebInterface) {
			res.redirect("/#ok_status");
		} else {
			res.send("OK");
		}
	});
});

app.get("/", function (req, res) {
	res.sendFile("submit.html", { root: __dirname });
});

app.listen(5000);

const eventFields = [
	"eventCode",
	"scoutType",
	"teamNumber",
	"mMatchNumber",
	"mMatchType",
	"mAllianceColor",
	"mAutoGearStrategy",
	"mAutoLowShots",
	"mAutoHighShots",
	"mAutoPercentShotsMissed",
	"mAutoCrossedBaseline",
	"mTeleGearsPlaced",
	"mTeleLowShots",
	"mTeleHighShots",
	"mTelePercentShotsMissed",
	"mTeleRotorsSpinning",
	"mTeleBallRetrievalMethod",
	"mTeleRobotClimbStatus",
	"mTeleAirshipReadyForTakeoff",
	"mComments",
	"mOverallStrategy",
	"mRedMatchPoints",
	"mBlueMatchPoints",
	"mRedRankingPoints",
	"mBlueRankingPoints",
	"pTeamName",
	"pDrivetraintype",
	"pMatchStrategy",
	"pRobotStrengths",
	"pRobotWeaknesses",
	"pOtherComments"
];
function sendToSheet(event, callback) {
	let values = [
		(new Date()).toISOString() // timestamp
	];
	eventFields.forEach(f => {
		if (event.hasOwnProperty(f)) {
			values.push(event[f]);
		} else {
			values.push("");
		}
	});
	// submit to GSheets
	sheets.spreadsheets.values.append({
		auth: authClient,
		range: "Data",
		valueInputOption: "RAW",
		resource: {
			values: [
				values
			]
		},
		spreadsheetId: process.env.SHEET_ID
	}, callback);
}

const reconnect = function () {
	console.log("Connecting...");
	client.connect(creds).then(function () {
		console.log("Connected to Hangouts");
	});
};

client.on('connect_failed', function () {
	console.log("Oh noes, lost connection!");
	Q.Promise(function (rs) {
		setTimeout(rs, 3000);
	}).then(reconnect);
});

reconnect();