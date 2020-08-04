import socketio from "socket.io";
import fs from "fs";
import path from "path";
import { Config } from "../config";
import AWS from "aws-sdk";
import { ChatMessage } from "../models/messages";
import { DB } from "../db";
import jwt from "jsonwebtoken";
import logger from "../lib/logger";

const cfg = new Config();
const s3 = new AWS.S3({
  accessKeyId: cfg.AWS_S3.ACCESS_ID,
  secretAccessKey: cfg.AWS_S3.ACCESS_KEY,
});

export let SocketIO: socketio.Server|null = null;

export default (server: any, db: DB) => {
  if (SocketIO) {
    return SocketIO;
  }
  const io = socketio.listen(server);
  io.on("connection", (socket) => {
    // socket id when user reconnected
    console.log(`user connected, id is ${socket.id}`);
    socket.emit("id", socket.id);

    // put user in socket rooms (self id room and join rooms)
    socket.on("init", async (data) => {
      const userId = data.id;
      socket.join(userId);
    });

    socket.on("admin_init", async (data) => {
      // join manager in his own room
      socket.join("manager");
    });

    socket.on("customer_init", async (data) => {
      // join customer in his room
      socket.join(`customer_service_room_${data.roomId}`);
    });

    socket.on("payment_init", async (data) => {
      const { token } = data;
      let { accountId } = <any> jwt.verify(token, cfg.JWT.SECRET);
      const room = `payment:${accountId}`;
      logger.info("Payment socket inited, Room ID: " + room);
      socket.join(room);
      const payload = { foo: "bar" };
    });

    socket.on("admin_send", async (data) => {
      // send
      let imageUrl = "";
      console.log(data);

      // check data sender
      let chatMessage = new ChatMessage(db);
      if (data.image) {
        let base64Image = data.image.split(";base64,").pop();
        let fname = `admin_chat_image_${Date.now().toString()}.png`;
        let fpath = path.join(__dirname, "../uploads", fname);
        fs.writeFileSync(fpath, base64Image, { encoding: "base64" });

        const fileContent = fs.readFileSync(fpath);

        // Setting up S3 upload parameters
        const params = {
          Bucket: cfg.AWS_S3.BUCKET_NAME,
          Key: `media/${fname}`, // File name you want to save as in S3
          Body: fileContent,
          ACL: "public-read",
        };

        s3.upload(params, async (err: any, uploadedData: any) => {
          if (err) {
            console.log("error occured while upload to amazon");
          }
          console.log(
            `File uploaded to AWS S3 successfully. ${uploadedData.Location}`
          );
          imageUrl = uploadedData.Location;

          // save message data
          let newMessage = {
            sender: data.sender,
            senderName: data.senderName,
            receiver: data.receiver,
            senderImg: data.senderImg,
            receiverImg: "",
            createdAt: data.createdAt,
            message: data.message,
            image: imageUrl,
            read: false,
          };
          await chatMessage.insertOne(newMessage);

          socket
            .to(`customer_service_room_${data.receiver}`)
            .emit("to_customer", newMessage);
        });
      } else {
        // save message data
        let newMessage = {
          sender: data.sender,
          senderName: data.senderName,
          receiver: data.receiver,
          senderImg: data.senderImg,
          receiverImg: "",
          createdAt: data.createdAt,
          message: data.message,
          read: false,
        };
        await chatMessage.insertOne(newMessage);

        socket
          .to(`customer_service_room_${data.receiver}`)
          .emit("to_customer", newMessage);
      }
    });

    socket.on("customer_send", async (data) => {
      // send
      let imageUrl = "";

      // check data sender
      let userNo = 0;
      let chatMessage = new ChatMessage(db);
      if (data.username === "") {
        // find current user on the socket
        let c = await chatMessage.getCollection();
        let messageItem = await c.findOne({ sender: data.sender });
        if (messageItem) {
          userNo = messageItem.userNo;
        } else {
          messageItem = c
            .find({ userNo: { $exists: true } })
            .sort({ userNo: -1 })
            .limit(1);
          let result = await messageItem.toArray();
          if (result.length === 0) {
            userNo = 1;
          } else {
            userNo = result[0].userNo + 1;
          }
        }
      }

      if (data.image) {
        let base64Image = data.image.split(";base64,").pop();
        let fname = `customer_chat_image_${Date.now().toString()}.png`;
        let fpath = path.join(__dirname, "../uploads", fname);
        fs.writeFileSync(fpath, base64Image, { encoding: "base64" });
        const cfg = new Config();
        const s3 = new AWS.S3({
          accessKeyId: cfg.AWS_S3.ACCESS_ID,
          secretAccessKey: cfg.AWS_S3.ACCESS_KEY,
        });

        const fileContent = fs.readFileSync(fpath);

        // Setting up S3 upload parameters
        const params = {
          Bucket: cfg.AWS_S3.BUCKET_NAME,
          Key: `media/${fname}`, // File name you want to save as in S3
          Body: fileContent,
          ACL: "public-read",
        };

        s3.upload(params, async (err: any, uploadedData: any) => {
          if (err) {
            console.log("error occured while upload to amazon");
          }
          console.log(
            `File uploaded to AWS S3 successfully. ${uploadedData.Location}`
          );
          imageUrl = uploadedData.Location;

          // save message data
          let newMessage = {
            sender: data.sender,
            userNo: userNo,
            senderName: data.username,
            receiver: "manager",
            senderImg: data.senderImg,
            receiverImg: "",
            createdAt: data.createdAt,
            message: data.message,
            image: imageUrl,
            read: false,
          };
          await chatMessage.insertOne(newMessage);

          socket.to("manager").emit("to_manager", newMessage);
        });
      } else {
        let newMessage = {
          sender: data.sender,
          userNo: userNo,
          senderName: data.username,
          receiver: "manager",
          senderImg: data.senderImg,
          receiverImg: "",
          createdAt: data.createdAt,
          message: data.message,
          read: false,
        };
        await chatMessage.insertOne(newMessage);
        socket.to("manager").emit("to_manager", newMessage);
      }
    });
  });
  SocketIO = io;
  return io;
};
