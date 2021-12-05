import winston from 'winston';

const { padLevels, combine, timestamp, colorize, printf } = winston.format;

export default winston.createLogger({
  transports: [new winston.transports.Console({ handleExceptions: true })],
  format: combine(
    padLevels(),
    winston.format((info) => ({ ...info, level: info.level.toUpperCase() }))(),
    colorize(),
    timestamp(),
    printf((info) => {
      let line = `${info.timestamp} [${info.level}]${info.message}`;
      if (info.context) {
        line += ` {${Object.keys(info.context).map(key => `${key}=${JSON.stringify(info.context[key])}`).join(', ')}}`;
      }

      if (info.error && info.error instanceof Error) {
        line += `\nStack trace: ${info.error.stack}`;
      }

      return line;
    })
  )
});
