import express, {Request, Response} from "express";
import { DB } from "../db";
import { ChatMessage } from "../models/messages";

export function ChatMessageRouter(db: DB){
  const router = express.Router();
  const controller = new ChatMessage(db);
  // customer service
  router.get('/:userId/:pageIndex', (req, res) => { controller.getChatMessages(req, res) } );
  router.get('/chatmessages/reset/:messageId', (req, res) => { controller.resetMessage(req, res); });

  return router;
};

