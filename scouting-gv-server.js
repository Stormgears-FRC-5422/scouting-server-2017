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
require('dotenv').config();

const creds = function() {
	return {
		auth: () => process.env.GOOGLE_OAUTH_TOKEN // https://github.com/tdryer/hangups/issues/260#issuecomment-246578670
	};
};

const client = new Client({
	tokenPersistence: {
		save: function(token) {
			return new Promise((resolve, reject) => {
				// TODO
				console.log("TODO: Save refresh token: " + token);
			});
		},
		load: function() {
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
auth.getApplicationDefault(function(err, auth) {
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

client.on("chat_message", function(ev) {
	// get the original message text
	let messageText = "";
	// let messageText = ev.chat_message.message_content.segment[0].text;
	ev.chat_message.message_content.segment.forEach(function(seg) {
		messageText += seg.text.trim();
	});

	if (!messageText.match(/^STORMGEARS_SCOUT/)) {
		return;
	}
	console.log(messageText);
	messageText = messageText.substring("STORMGEARS_SCOUT".length).trim();

	const message = Event.decode(base94.decode(messageText)).toObject();
	console.log(message);

	delete message.password;

	let values = [
		(new Date()).toISOString() // timestamp
	];
	eventFields.forEach(f => {
		if (message.hasOwnProperty(f)) {
			values.push(message[f]);
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
	}, function(err, res) {
		if (err) {
			console.error(err);
			client.sendchatmessage(ev.conversation_id.id, [[0, "Oh no! Something went wrong!"]], null, null, null, [Schema.ClientDeliveryMediumType.GOOGLE_VOICE]);
			return;
		}

		client.sendchatmessage(ev.conversation_id.id, [[0, randomReplier.gen()]], null, null, null, [Schema.ClientDeliveryMediumType.GOOGLE_VOICE]); // only supports Google Voice
	});

	// send a message of acknowledgement

});

const reconnect = function() {
	console.log("Connecting...");
	client.connect(creds).then(function() {
		console.log("Connected to Hangouts");
	});
};

client.on('connect_failed', function() {
	console.log("Oh noes, lost connection!");
	Q.Promise(function(rs) {
		setTimeout(rs, 3000);
	}).then(reconnect);
});

reconnect();