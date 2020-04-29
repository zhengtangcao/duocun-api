import winston, { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
const { combine, timestamp, label, printf } = format;

import dotenv from "dotenv";
dotenv.config();

const logFormat = printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level}: ${message}`;
});

const transport = new DailyRotateFile({
  filename: "duocun-api-%DATE%.log",
  datePattern: "YYYY-MM-DD-HH",
  zippedArchive: false,
  maxSize: "20m",
  maxFiles: "14d",
});

const logger = createLogger({
  level: "debug",
  format: combine(timestamp(), logFormat),
  defaultMeta: { service: "duocun-api" },
  transports: [
    transport,
    //
    // - Write all logs with level `error` and below to `error.log`
    // - Write all logs with level `info` and below to `combined.log`
    //
    // new winston.transports.File({ filename: "error.log", level: "error" }),
    // new winston.transports.File({ filename: "info.log", level: "info" }),
  ],
});

if (process.env.ENV == "dev") {
  logger.add(
    new winston.transports.Console({
      level: "verbose",
      format: winston.format.simple(),
    })
  );
}

export function getLogger(moduleName: string = '') {
  return {
    debug: function(message:string) {
      logger.debug(`[${moduleName}] ${message}`);
    },
    info: function(message:string) {
      logger.info(`[${moduleName}] ${message}`);
    },
    error: function(message:string) {
      logger.error(`[${moduleName}] ${message}`);
    },
    warn: function(message:string) {
      logger.warn(`[${moduleName}] ${message}`);
    },
    crit: function(message:string) {
      logger.crit(`[${moduleName}] ${message}`);
    }
  };
};

export default logger;
