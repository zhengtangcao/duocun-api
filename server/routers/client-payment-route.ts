import express, { Request, Response } from "express";

import { DB } from "../db";
import { ClientPayment, PaymentAction } from "../models/client-payment";
import { Model, Code } from "../models/model";
import { Order, IOrder, OrderStatus, PaymentMethod, PaymentStatus } from "../models/order";
import MonerisCheckout from "moneris-checkout";
import { EnvironmentType, BooleanType } from "moneris-checkout/dist/types/global";
import { Config } from "../config";
import { Controller } from "../controllers/controller";
import { ClientCredit } from "../models/client-credit";
const SNAPPAY_BANK_ID = "5e60139810cc1f34dea85349";
const SNAPPAY_BANK_NAME = "SnapPay Bank";

const cfg = new Config();

export const moneris = new MonerisCheckout(
  cfg.MONERIS.STORE_ID,
  cfg.MONERIS.API_TOKEN,
  cfg.MONERIS.CHECKOUT_ID,
  <EnvironmentType> cfg.MONERIS.ENVIRONMENT
);

export function ClientPaymentRouter(db: DB) {
  const router = express.Router();
  const model = new ClientPayment(db);
  const controller = new ClientPaymentController(db);

  //yaml api
  router.post('/snappay', (req, res) => { controller.gv1_payBySnappay(req, res) });
  router.post('/stripe', (req, res) => { controller.gv1_payByStripe(req, res); });


  // snappy related endpoints
  // https://localhost:8000/api/ClientPayments/payBySnappay

  // public endpoint
  // description: if orders > 0 it means buy goods, if orders == null it means add credit
  // Input:
  // paymentActionCode --- [string] 'P' for purchase good, 'A' for add credit
  // appCode --- [number], 123 for Grocery, 122 for Food Delivery
  // accountId --- [string] client account Id;
  // amount --- [number] payable = purchase amount - balance
  // returnUrl --- [string]
  // paymentId --- [string]     (optional for add credit)
  // merchantNames --- [string[]]  (optional for add credit)
  // Return: {err, {url}}, then wait snappy post notify 
  router.post('/payBySnappay', (req, res) => { controller.payBySnappay(req, res) });

  // private 
  router.post('/notify', (req, res) => { controller.snappayNotify(req, res); });

  // stripe related endpoints
  // public
  // description: if orders > 0 it means buy goods, if orders == null it means add credit

  // Input:
  // paymentActionCode --- [string] 'P' for purchase good, 'A' for add credit
  // paymentMethodId = [string] get from stripe;
  // accountId --- [string] client account Id;
  // accountName --- [string]
  // amount --- [number] client payable
  // note --- [string]
  // paymentId --- [string]     (optional for add credit)
  // merchantNames --- [string[]]  (optional for add credit)
  // Return: None
  router.post('/payByCreditCard', (req, res) => { controller.payByStripe(req, res); });

  // v1 api
  // router.post('/payByCreditCard', (req, res) => { model.payByCreditCard(req, res); });
  // router.post('/payBySnappay', (req, res) => { model.payBySnappay(req, res) });
  // router.get('/hello', (req, res) => { model.hello(req, res) });
  // router.get('/session', (req, res) => {model.createStripeSession(req, res); });
  // router.post('/checkout', (req, res) => {model.checkout(req, res); });

  // deprecated
  // router.post('/stripeAddCredit', (req, res) => {model.stripeAddCredit(req, res); });
  // router.post('/stripRefund', (req, res) => {model.stripeRefund(req, res); });

  // router.post('/snappayRefund', (req, res) => {model.snappayRefund(req, res); });


  // router.post('/addGroupDiscount', (req, res) => { model.reqAddGroupDiscount(req, res); });
  // router.post('/removeGroupDiscount', (req, res) => { model.reqRemoveGroupDiscount(req, res); });


  router.post('/moneris/preload', (req, res) => { controller.preload(req, res) });
  router.post('/moneris/receipt', (req, res) => { controller.receipt(req, res) });


  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });
  // router.post('/', (req, res) => { model.createAndUpdateBalance(req, res); });
  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });


  return router;
};



export class ClientPaymentController extends Controller {
  public model: ClientPayment;
  orderModel: Order;
  clientCreditModel: ClientCredit;
  constructor(db: DB) {
    super(new ClientPayment(db), db);
    this.orderModel = new Order(db);
    this.model = new ClientPayment(db);
    this.clientCreditModel = new ClientCredit(db);
  }

  // input --- appCode, accountId, amount
  payBySnappay(req: Request, res: Response) {
    const appCode = req.body.appCode;
    // const orders = req.body.orders;
    const paymentActionCode = req.body.paymentActionCode;
    const paymentId = req.body.paymentId;
    const merchantNames = req.body.merchantNames;
    const accountId = req.body.accountId;
    const returnUrl = req.body.returnUrl;
    const amount = Math.round(+req.body.amount * 100) / 100;
    

    res.setHeader("Content-Type", "application/json");
    this.model.payBySnappay(paymentActionCode, appCode, accountId, amount, returnUrl, paymentId, merchantNames).then((r: any) => {
      res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
    });
  }

  gv1_payBySnappay(req: Request, res: Response) {
    const appCode = req.body.appCode;
    // const orders = req.body.orders;
    const paymentActionCode = req.body.paymentActionCode;
    const paymentId = req.body.paymentId;
    const merchantNames = req.body.merchantNames;
    const accountId = req.body.accountId;
    const returnUrl = req.body.returnUrl;
    const amount = Math.round(+req.body.amount * 100) / 100;
    

    res.setHeader("Content-Type", "application/json");
    this.model.payBySnappay(paymentActionCode, appCode, accountId, amount, returnUrl, paymentId, merchantNames).then((r: any) => {
      res.send(JSON.stringify(
        {code: r ? Code.SUCCESS : Code.FAIL,
          data: r,
         }
    
        )); // IPaymentResponse
    });
  }

  // This request could response multiple times !!!
  // return rsp: IPaymentResponse
  async snappayNotify(req: Request, res: Response) {
    const rsp = req.body;
    // console.log('snappayNotify trans_status:' + b.trans_status);
    // console.log('snappayNotify trans_no:' + b.trans_no);
    // console.log('snappayNotify out_order_no' + b.out_order_no);
    // console.log('snappayNotify customer_paid_amount' + b.customer_paid_amount);
    // console.log('snappayNotify trans_amount' + b.trans_amount);
    const amount = Math.round(+req.body.trans_amount * 100) / 100;
    const paymentId = rsp ? rsp.out_order_no : "";
    const accountId = SNAPPAY_BANK_ID;
    const message = "paymentId:" + paymentId + ", msg:" + JSON.stringify(req.body);
    this.model.addLogToDB(accountId, 'snappay notify', '', message).then(() => { });

    if (rsp && rsp.trans_status === "SUCCESS") {
      await this.model.processSnappayNotify(paymentId, amount);
      res.setHeader("Content-Type", "application/json");
      res.send({ code: "0" }); // must return as snappay gateway required
    }
  }

  payByStripe(req: Request, res: Response) {
    // const appType = req.body.appType;
    const paymentActionCode = req.body.paymentActionCode;
    const paymentMethodId = req.body.paymentMethodId;
    const paymentId = req.body.paymentId;
    const merchantNames = req.body.merchantNames
    const accountId = req.body.accountId;
    const accountName = req.body.accountName;
    const note = req.body.note;
    let amount = +req.body.amount;

    res.setHeader("Content-Type", "application/json");
    this.model.payByStripe(paymentActionCode, paymentMethodId, accountId, accountName, amount, note, paymentId, merchantNames).then((rsp: any) => {
      res.send(JSON.stringify(rsp, null, 3)); // IPaymentResponse
    });
  }

  gv1_payByStripe(req: Request, res: Response) {
    // const appType = req.body.appType;
    const paymentActionCode = req.body.paymentActionCode;
    const paymentMethodId = req.body.paymentMethodId;
    const paymentId = req.body.paymentId;
    const merchantNames = req.body.merchantNames
    const accountId = req.body.accountId;
    const accountName = req.body.accountName;
    const note = req.body.note;
    let amount = +req.body.amount;

    res.setHeader("Content-Type", "application/json");
    this.model.payByStripe(paymentActionCode, paymentMethodId, accountId, accountName, amount, note, paymentId, merchantNames).then((rsp: any) => {
      res.send(JSON.stringify({
        code: rsp ? Code.SUCCESS : Code.FAIL,
        data: rsp,
      })); // IPaymentResponse
    });
  }

  async preload(req: Request, res: Response) {
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      return res.json({
        code: Code.FAIL,
        message: "authentication failed"
      });
    }
    const paymentId = req.body.paymentId;
    const orders: Array<IOrder> = await this.orderModel.find({
      paymentId,
      status: OrderStatus.TEMP
    });
    let total = 0;
    orders.forEach((order: IOrder) => {
      total += order.total;
    });
    try {
      const preload = await moneris.preload(total, {
        cust_id: account._id.toString(),
        // contact_details: {
        //   first_name: account.username,
        //   phone: account.phone
        // },
        // shipping_details: {
        //   address_1: `${orders[0].location.streetNumber || ""} ${orders[0].location.streetName || ""}`,
        //   city: orders[0].location.city || "",
        //   province: orders[0].location.province || "",
        //   country: orders[0].location.country || "",
        //   postal_code: orders[0].location.postalCode || ""
        // }
      });
      const success: BooleanType = preload.response.success;
      if (success === BooleanType.TRUE) {
        const cc = {
          accountId: account._id,
          accountName: account.username,
          total,
          paymentMethod: PaymentMethod.CREDIT_CARD,
          note: "",
          paymentId,
          status: PaymentStatus.UNPAID
        };
        await this.clientCreditModel.insertOne(cc);
        return res.json({
          code: Code.SUCCESS,
          data: preload.response.ticket
        });
      } else {
        return res.json({
          code: Code.FAIL,
          data: preload
        });
      }
    } catch (e) {
      return res.json({
        code: Code.FAIL,
        data: e
      });
    }
  }

  async receipt(req: Request, res: Response) {
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      return res.json({
        code: Code.FAIL,
        message: "authentication failed"
      });
    }

    const paymentId = req.body.paymentId;
    const ticket = req.body.ticket;
    const receipt = await moneris.receipt(ticket);
    const cc = await this.clientCreditModel.findOne({
      paymentId
    });
    if (!cc) {
      return res.json({
        code: Code.FAIL,
        message: "client credits empty"
      });
    }
    if (receipt.response.success != BooleanType.FALSE) {
      return res.json({
        code: Code.FAIL,
        data: receipt
      });
    }
    if (!receipt.response.receipt || !receipt.response.receipt.cc || !receipt.response.receipt.cc.amount) {
      return res.json({
        code: Code.FAIL,
        data: receipt
      });
    }
    await this.orderModel.processAfterPay(paymentId, PaymentAction.PAY.code, parseFloat(receipt.response.receipt?.cc?.amount || "0"), ticket);
    cc.status = PaymentStatus.PAID;
    await this.clientCreditModel.updateOne({ _id: cc._id }, cc);
    return res.json({
      code: Code.SUCCESS
    });
  }

}


