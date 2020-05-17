import { Controller, Code } from "./controller";
import express, { Request, Response }  from "express";
import { Pickup } from "../models/pickup";
import { DB } from "../db";
import { Model } from "../models/model";

export class PickupController extends Controller{
  model: Pickup;

  constructor(model:Pickup, db: DB) {
    super(model, db);
    this.model = model;
  }

  async list(req: Request, res: Response):Promise<void> { 
    let query = {};
    if (req.headers) {
      if (req.headers.filter && typeof req.headers.filter === 'string') {
        query = req.headers.filter ? JSON.parse(req.headers.filter) : null;
      }
    }
    const options: any = req.query.options;
    let data:any[] = [];
    let count:number = 0;
    let code = Code.FAIL;
    try {
      if(query){
        // console.log(`query: ${where}`);
        // TODO: no where will return error, is it a good choice?
        const r = await this.model.find_v2(query, options)
        code = Code.SUCCESS;
        data = r.data;
        count = r.count;
      } else{
        const r = await this.model.find_v2({}, options)
        code = Code.SUCCESS;
        data = r.data;
        count = r.count;
      }
      res.setHeader('Content-Type', 'application/json'); 
      res.send({
        code: code,
        data: data,
        count: count
      });
    } catch (error) {
      console.log(`list error: ${error.message}`);
      // logger.error(`list error: ${error}`);
    }
  }

  async get(req: Request, res: Response):Promise<void>  {
    const id = req.params.id;
    let data:any = {};
    let code = Code.FAIL;
    const options: any = ( req.query && req.query.options ) || {};

    try {
      data = await this.model.getById(id, options);
      code = Code.SUCCESS;
    } catch (error) {
      // logger.error(`get error : ${error}`);
    } finally {
      res.setHeader('Content-Type', 'application/json');
      res.send({
        code: code,
        data: data 
      });
    }
  }

  async updateOne(req: Request, res: Response): Promise<void> {
    const _id = req.params.id;
    const updates = req.body.data;
    let code = Code.FAIL;
    let data = _id;
    try {
      if (req.body) {
        const r = await this.model.updateOne( 
          {_id},
          updates
        );
        if (r.nModified === 1 && r.ok === 1) {
          code = Code.SUCCESS;
          data = _id; // r.upsertedId ?
        } else {
          code = Code.FAIL;
          data = _id;
        }
      }
    } catch (error) {
      // logger.error(`updateOne error: ${error}`);
    } finally {
      res.setHeader("Content-Type", "application/json");
      res.send({
        code,
        data,
      });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    const doc = req.body;
    let code = Code.FAIL;
    let data = {};
    try {
      if (doc) {
        const r = await this.model.insertOne(doc);
        if (r) {
          code = Code.SUCCESS;
          data = r;
        }
      }
    } catch (error) {
      // logger.error(`create one order error: ${error}`);
    } finally {
      res.setHeader("Content-Type", "application/json");
      res.send(
        JSON.stringify({
          code: code,
          data: data,
        })
      );
    }
  }

  async removeOrder(req: Request, res: Response) {
    const orderId = req.params.id;
    let code = Code.FAIL;
    let data = {};
    try {
      const r = await this.model.deleteOne(orderId);
      if (r) {
        code = Code.SUCCESS;
        data = r;
      }
    } catch (error) {
      // logger.error(`delete one order error: ${error}`);
    } finally {
      res.setHeader("Content-Type", "application/json");
      res.send(
        JSON.stringify({
          code: code,
          data: data,
        })
      );
    }
  }

}