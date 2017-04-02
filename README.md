# scouting-server
HTTPS and Google Voice-based Scouting Server

## Usage
```bash
git clone https://github.com/Stormgears-FRC-5422/scouting-server.git
cd scouting-server
yarn # npm install also works
cp .env.example .env
# edit .env with your favorite editor
node scouting-server.js
```

## Configuration
This scouting server uses a combination of HTTP and Google Voice to receive data. 
To use the HTTP portion, simply run it on a publicly-facing server and configure the Android
application to use it. For HTTPS, you should use something like nginx as a reverse proxy.

SMS setup is a little more tricky. First, make sure you have a Google Voice number. Then, you will 
need to fill out the `GOOGLE_OAUTH_TOKEN` and `GOOGLE_REFRESH_TOKEN` portions of the `.env` file.

This is best done by running [Hangups](https://github.com/tdryer/hangups) and grabbing the tokens from
its cache directory. See [this](https://github.com/ActiveState/appdirs#some-example-output) for some example paths to search in. 

Note that you may need to refresh the Hangouts tokens every once in a while.

After you have set up the data receiving, you will need to set up the Google Sheets integration. 
[Set up a service account](https://developers.google.com/identity/protocols/OAuth2ServiceAccount), then download the JSON token file
into serviceaccount.json. Then, inside the Google Sheet, create a sheet named "Data" and share the document with the
service account's email address.
