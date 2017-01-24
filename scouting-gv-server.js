/**
 * Created by andrew on 1/24/17.
 */
const Client = require("hangupsjs");
const Schema = require("hangupsjs/lib/schema");
const Q = require("q");
require('dotenv').config();

const creds = function() {
	return {
		auth: () => process.env.GOOGLE_OAUTH_TOKEN // https://github.com/tdryer/hangups/issues/260#issuecomment-246578670
	};
};

const client = new Client();
client.loglevel("info");

client.on("chat_message", function(ev) {
	if (ev.sender_id.gaia_id === "116059534239720293301") {
		return;
	}
	console.log(ev);

	// get the original message text
	const messageText = ev.chat_message.message_content.segment[0].text;
	if (!messageText.match(/^STORMGEARS_SCOUT\{/)) {
		return;
	}

	// send a message of acknowledgement
	client.sendchatmessage(ev.conversation_id.id, [[0, 'Got it! (the time is ' + Date.now() + ")"]], null, null, null, [Schema.ClientDeliveryMediumType.GOOGLE_VOICE]); // only supports Google Voice
});

const reconnect = function() {
	client.connect(creds).then(function() {
		console.log("Connected to Hangouts");
	});
};

client.on('connect_failed', function() {
	Q.Promise(function(rs) {
		setTimeout(rs, 3000);
	}).then(reconnect);
});

reconnect();