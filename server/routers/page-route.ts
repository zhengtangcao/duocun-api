import express from "express";
import { DB } from "../db";
import { Page, IPage, PageStatus } from "../models/page";
import { Request, Response } from "express";
import { Model, Code } from "../models/model";

export function PageRouter(db: DB) {
  const router = express.Router();
  const controller = new PageController(db);
  
  router.get("/loadTabs", (req, res) => { controller.getList(req, res) });
  router.get("/page/:slug", (req, res) => { controller.getBySlug(req, res) });

  return router;
}

export class PageController {
  db: DB;
  model: Page;
  constructor(db: DB) {
    this.db = db;
    this.model = new Page(db);
  }

  async getList(req: Request, res: Response) {
    const pages = await this.model.find({ status: PageStatus.PUBLISH }, {}, ["_id", "title", "titleEN", "slug"]);
    res.json({
      code: Code.SUCCESS,
      data: pages
    });
  }

  async getBySlug(req: Request, res: Response) {
    const page = await this.model.findOne({ status: PageStatus.PUBLISH });
    if (page) {
      res.json({
        code: Code.SUCCESS,
        data: page
      });
    } else {
      res.json({
        code: Code.FAIL,
        message: "page not found"
      });
    }
  }

}