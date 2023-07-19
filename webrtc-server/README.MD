
#webrtc-server


The webrtc-server is the singaling server which actually enables to establish a call/session between the peers. This server also enables exhange of vital ICE information, mute/unmute, share/unshare, close etc. information between the peers. This signaling server is secured and supports https and wss protocols. Here are the simple steps to setup this server:

    1. Install NodeJS (16+) and NPM
    2. Run this command to install required packages:

          npm run install
    3. Run this command to start the server:

          Node server.js
    4. Signaling server is up and running at port 9443


## Securing Web/Application servers
