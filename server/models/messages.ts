import { DB } from "../db";
import { Model, Code } from "./model";
import moment from "moment";
import { ObjectID, Collection } from "mongodb";
import { Request, Response } from "express";


export interface MessageItem{
  _id: string;
  sender: string;
  receiver: string;
  senderImg: string;
  receiverImg: string;
  createdAt: number;
  readAt?: number;
  message: string;
  image?: string;
  read: boolean;
}

export class ChatMessage extends Model{
  constructor(db: DB){
    super(db, "messages");
  }

  getChatMessages(req: Request, res: Response){    
    let { userId, pageIndex } = req.params;
    let offset = parseInt(pageIndex) * 20;
    
    const query = { $or: [{ sender: userId }, { receiver: userId }] };
    // console.log(q);
    let messageData = this.find(query, {skip: offset, limit: 20, sort: [["createdAt", -1]]}).then(messageData => {
      res.send(
        JSON.stringify({
          code: Code.SUCCESS,
          data: messageData
        })
      );
    });
  }

  resetMessage(req: Request, res: Response){
    let messageId = req.params.messageId;
    this.getCollection().then((c: Collection) => {
      c.updateOne({_id: new ObjectID(messageId)}, { $set: {read : true, readAt: Date.now()}}, (err, r:any) => {
        if(err){
          console.log(err);
        }else{
          res.send(
            JSON.stringify({
              code: 'success',
              data: r.result
            })
          )
        }
      })
    })
  }
}