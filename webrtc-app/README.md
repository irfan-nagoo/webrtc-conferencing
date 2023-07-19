
# webrtc-app

The WebRTC project allows each participant to connect directly to every other participant in the same session in a mesh topology. Since every participant sends/receives media content from others, this might degrade quality of service parameters (Video/Audio quality) as the number of participant in a single session go on increasing. This a an expected behavior and would be followed by high memory and CPU utilization on the participants device. This is where the media server (like Janos, Jitsi etc.) comes into the picture. The media server follows start topology where every participant only connects to the media server and hence reducing the load on self.

The file transfer in the chat application is async. Which means, once you select and send the file, the file transfer will happen in the background. The sender can continue sending other text. If its a large file, all receivers will get it in a while. It took about 12+ minutes to transfer a file of 1GB. However, this depends on network bandwidth and other parameters.

We have other servers in WebRTC like STUN and TURN server. The STUN server helps in finding the participants public addresses and other communication information. Few of the STUN servers are already configured in this application. The TURN server is generally not required however, is used incase the participants cannot establish peer connection due to a firewall, different network, NAT restrictions etc. In case a TURN server is required, check the config.js comments on how to get it.

This WebRTC application works on the principles of offer and answer. Here is the flow of events that happen:

    1. Participant 1 joins a room - No connection is created yet.
    2. Participant 2 joins same room.
    3. P2 publishes GOT_USER_MEDIA event to all other participants in the room.
    4. P1 receives the event and does following -
          1. Creates new peer connection.
          2. Adds all media (Audio/Video/Display) tracks to the connection.
          3. This triggers 'onnegotiationneeded' event and an offer is send to P2.
          4. P2 accepts offer and creates new connection. This also triggers ICE event exchange
          5. P2 sends answer to P1.

In order to run this application, the signaling server must be setup first. Read the README.MD of signaling server to set it up. Follow these steps to setup this application:

1. Change the IP address of the signaling server in config.js to where it's setup.
2. Setup NPM and run this command to install all required packages:
   
         npm run install
3. Now, run this command to start Webpack dev server:
   
         npm run dev
4. This will take a while to startup and the application will open up in the browser.


