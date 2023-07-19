'use strict';

const winston =  require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.simple(),
    defaultMeta: { id: 'NODEJS-RAPTOR' },
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.splat(),
        winston.format.timestamp({
            format: 'YYYY-MM-DD hh:mm:ss:SSS'
        }),
        winston.format.printf(
            info => `${info.timestamp} ${info.level} [${info.id}]: ${info.message}`
        )
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = {logger};