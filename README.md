# webrtc-conferencing

![webrtc](https://github.com/irfan-nagoo/webrtc-conferencing/assets/96521607/2917c651-ede7-406c-b758-f48fc7ebcd52)

This project started with some hands on using [Google WebRTC samples](https://codelabs.developers.google.com/codelabs/webrtc-web#0) and ended up in a full fledge Realtime communication application with exciting features and UI. This application handles almost all forms of Realtime remote communication options. There is no extra installation required to use this application except the web browser. This application supports following features:

    1. Audio/Video conferencing features with multiple participants.
    2. Multiple parallel conferences separated by rooms.
    3. Chat feature using group text messages.
    4. File transfers (supports large file transfer, tested with whopping 1GB media file).
    5. Screen share (All major uses cases covered)

**Devices Supported:** Windows desktop, Android devices, ioS devices (iPhone) etc. This application works smoothly with latest Chrome and Edge browser, and should work with other major browsers also.

This application uses core WebRTC APIs referencing [Mozilla documentation](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection) without using any wrapper frameworks (like simplepeer, peerjs etc.). All forms of transport communication in this application are secure: secure Video/Audio/Display streams, secure text, secure file transfer, secure signaling etc. Just a heads up, the QOS parameters can go down when the number of participants in the same session go up.

I recommend reading the READ.ME section of webrtc-app/webrtc-server to understanding the working of this application. This application has following modules:

    1. webrtc-app   : This is the actual browser application which runs on the device and served by Webpack server (Two browsers in the above diagram).
    2. webrtc-server: This is the signaling server to exchange SDP (Session description) information (Laptop in the above diagram).

**Tech Stack Browser App:** Html 5, Javascript, Bootstrap 5, Socket.io client, NPM, Webpack server

**Tech Stack Signaling Server:**  NodeJS 16, Socket.io server


This is my first every UI application with almost nil experience in the user interface software technologies. With significant experience in the server side technologies, it would be tough (considering the features this application has) for me to produce next one like this in the UI segment. This is one of the best applications I have every developed.  Here are few important stakeholders in this project from the logistics point of view:

1.	Customer/Manager:  Abdul Rashid Nagoo (my father, this requirement came from him)
2.	Product owner: Ruqia (my sister)
3.	Another Manager: Showkat (my brother in law)
4.	UI/UX: Hamza (my nephew, loves to puke on me)
5.	Developers:  Me, Musaib, Zayn (myself, my brother, my nephew, we love to develop)







