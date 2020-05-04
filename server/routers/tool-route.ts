import express from "express";
import { Request, Response } from "express";

import { DB } from "../db";
import { Account, AccountAttribute, IAccount } from "../models/account";
import { MerchantStuff } from "../merchant-stuff";
import { Utils } from "../utils";
import { Config } from "../config";
import { Model } from "../models/model";
import { Tool } from "../models/tool";

export function ToolRouter(db: DB) {
  const router = express.Router();
  const controller = new ToolController(db);


  return router;
}

export class ToolController {
  router = express.Router();
  toolModel: Tool;
  // utils: Utils;
  // cfg: Config;

  constructor(db: DB) {
    this.toolModel = new Tool(db);
  }

}