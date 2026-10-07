export const TRANSIT_TIME_ZONE = "America/Grenada";
export const transitHour = (date = new Date()) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TRANSIT_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(date));
