'use strict';


export const MAX_DATA_CHUNK_SIZE = 65535;
export const MAX_BUFFER_SIZE = 65536;

export const MessageType = {
    GOT_USER_MEDIA: 'got user media',
    OFFER: 'offer',
    ANSWER: 'answer',
    CANDIDATE: 'candidate',
    SCREEN_SHARE: 'screenshare',
    SCREEN_UNSHARE: 'screenunshare',
    MUTE: 'mute',
    UNMUTE: 'unmute',
    BYE: 'bye'
};
