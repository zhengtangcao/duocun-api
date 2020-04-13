import express, { Request, Response } from "express";
import { DB } from "../db";
import { Payment } from "../models/payment";
import { Model } from "../models/model";

export function PaymentRouter(db: DB) {
  const router = express.Router();
  const controller = new Payment(db);

  // v2 api
  router.get('/', (req, res) => { controller.list(req, res) });
  // router.get('/sync', (req, res) => { controller.sync(req, res) });

  return router;
};


export class PaymentController extends Model {
  model: Payment;

  constructor(db: DB) {
    super(db, 'payments');
  }

  sync(req: Request, res: Response) {
    // const phone = req.body.phone;
    // const verificationCode = req.body.verificationCode;

    // this.model.sync().then(() => {
    //   res.setHeader('Content-Type', 'application/json');
    //   res.send(JSON.stringify({status: 'success'}, null, 3));
    // });
  }
}