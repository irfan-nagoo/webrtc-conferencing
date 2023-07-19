
export const envConfig = {
    signalingServerUrl: 'wss://192.168.29.118:9443',
    signalingServerTransport: 'websocket',
    iceServers: {
        'iceServers': [
            { 'urls': 'stun:stun.services.mozilla.com' },
            { 'urls': 'stun:stun.l.google.com:19302' }
            //If TURN server is required (STUN server suffices 80% of times), one option is to create an account
            // on 'https://www.metered.ca/tools/openrelay/' , get TURN details and put it in the above iceServers
            // list or setup your own TURN/COTURN server.
        ]
    }
};