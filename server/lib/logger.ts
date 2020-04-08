
import bunyan from "bunyan";

const logging_dev = {
    name: "duocun-server",
    streams: [
        {
            level: "trace",
            stream: process.stdout // log INFO and above to stdout
        },
        {
            level: "debug",
            type: "rotating-file",
            path: "./duocun-server.log",
            period: "3d", // rotate every 3 days
            count: 12  // keep 12 back copies
        }
    ]
}

const logging_prod = {
    name: "duocun-server",
    stream: {
        level: "info",
        type: "rotating-file",
        path: "./duocun-server.log",
        period: "3d", // rotate every 3 days
        count: 12  // keep 12 back copies
    }
}

let log = bunyan.createLogger(logging_prod);

if(process.env.ENV === 'dev'){
    bunyan.createLogger(logging_dev);
}
    
export default log
