import express, { Request, Response } from "express";

import { DB } from "../db";
import { ClientPayment, PaymentAction, PaymentError } from "../models/client-payment";
import { Model, Code } from "../models/model";
import { Order, IOrder, OrderStatus, PaymentMethod, PaymentStatus } from "../models/order";
import MonerisCheckout from "moneris-checkout";
import { EnvironmentType, BooleanType } from "moneris-checkout/dist/types/global";
import { Config } from "../config";
import { Controller } from "../controllers/controller";
import { ClientCredit } from "../models/client-credit";
import logger from "../lib/logger";
import MonerisHt from 'moneris-node';
import moment from 'moment-timezone';
import Alphapay from 'alphapay';
import { CurrencyType, ChannelType } from "alphapay/dist/types/global";
import { QRCode } from "alphapay/dist/types/qrcode";
import { SuccessNotification } from "alphapay/dist/types/success-notification";
import { H5 } from "alphapay/dist/types/h5";
import { readlink } from "fs";
const SNAPPAY_BANK_ID = "5e60139810cc1f34dea85349";
const SNAPPAY_BANK_NAME = "SnapPay Bank";

const cfg = new Config();

export const moneris = new MonerisCheckout(
  cfg.MONERIS.STORE_ID,
  cfg.MONERIS.API_TOKEN,
  cfg.MONERIS.CHECKOUT_ID,
  <EnvironmentType> cfg.MONERIS.ENVIRONMENT
);

export const monerisHt = new MonerisHt({
  app_name: 'Duocun Inc',
  store_id: cfg.MONERIS.STORE_ID,
  api_token: cfg.MONERIS.API_TOKEN,
  test: false
});

export const alphapay = new Alphapay(cfg.ALPHAPAY.PARTNER_CODE, cfg.ALPHAPAY.CREDENTIAL_CODE);

// export const monerisHt = new MonerisHt({
//   app_name: 'Duocun Inc',
//   store_id: 'store5',
//   api_token: 'yesguy',
//   test: true
// });

const fe = function(arr: any,assertion: any = false){
  return Array.isArray(arr) && arr.length>0 && arr[0] ? (assertion ? arr[0]===assertion: arr[0]) : null;
}

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

  router.post('/moneris/htpay', (req, res) => { controller.monerisPay(req, res) });
  router.post('/moneris/preload', (req, res) => { controller.preload(req, res) });
  router.post('/moneris/receipt', (req, res) => { controller.receipt(req, res) });

  router.post('/alphapay/qrcode', (req, res) => { controller.alphaPayQRCode(req, res) })
  router.post('/alphapay/h5', (req, res) => { controller.alphaPayH5(req, res) })
  router.post('/alphapay/jsapi', (req, res) => { controller.alphaPayJsApi(req, res) })
  router.post('/alphapay/success', (req, res) => { controller.handleAlphapayNotification(req, res) })
  router.post('/check-payment', (req, res) => { controller.checkPayment(req, res) })


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
    logger.info("*********** BEGIN PAY BY STRIPE ***********");
    const paymentActionCode = req.body.paymentActionCode;
    const paymentMethodId = req.body.paymentMethodId;
    const paymentId = req.body.paymentId;
    const merchantNames = ['Duocun Inc.']; //req.body.merchantNames
    const accountId = req.body.accountId;
    const accountName = req.body.accountName;
    const note = req.body.note;
    let amount = +req.body.amount;
    logger.info(`Payment ID: ${paymentId}, AccountId: ${accountId}, Account Name: ${accountName}, Amount: ${amount}`);
    res.setHeader("Content-Type", "application/json");
    this.model.payByStripe(paymentActionCode, paymentMethodId, accountId, accountName, amount, note, paymentId, merchantNames).then((rsp: any) => {
      logger.info("*********** END PAY BY STRIPE ***********");
      res.send(JSON.stringify(rsp, null, 3)); // IPaymentResponse
    }).catch(e => {
      logger.error(e);
      logger.info("*********** END PAY BY STRIPE ***********");
      res.json({
        status: "F",
        err: 'unknown'
      })
    });
  }

  gv1_payByStripe(req: Request, res: Response) {
    // const appType = req.body.appType;
    const paymentActionCode = req.body.paymentActionCode;
    const paymentMethodId = req.body.paymentMethodId;
    const paymentId = req.body.paymentId;
    const merchantNames = ['Duocun Inc.']; // req.body.merchantNames
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
    logger.info("--- BEGIN MONERIS PRELOAD ---");
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      logger.info("authentication failed");
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        message: "authentication failed"
      });
    }
    const paymentId = req.body.paymentId;
    logger.info("paymentId: " + paymentId);
    const orders: Array<IOrder> = await this.orderModel.find({
      paymentId,
      status: OrderStatus.TEMP
    });
    if (!orders || !orders.length) {
      logger.info("orders empty");
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        message: "cannot find orders"
      });
    }
    let total = 0;
    orders.forEach((order: IOrder) => {
      total += order.total;
    });
    logger.info(`total price: ${total}`);
    try {
      const preload = await moneris.preload(total, {
        cust_id: account._id.toString(),
        contact_details: {
          first_name: account.username,
          phone: account.phone
        },
        shipping_details: {
          address_1: `${orders[0].location.streetNumber || ""} ${orders[0].location.streetName || ""}`,
          city: orders[0].location.city || "",
          province: orders[0].location.province || "",
          country: orders[0].location.country || "",
          postal_code: orders[0].location.postalCode || ""
        }
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
        logger.info(`ticket: ${preload.response?.ticket}`);
        logger.info("inserting client credit");
        await this.clientCreditModel.insertOne(cc);
        logger.info("--- END MONERIS PRELOAD ---");
        return res.json({
          code: Code.SUCCESS,
          data: preload.response.ticket
        });
      } else {
        logger.info("preload response returns fail");
        logger.info("--- END MONERIS PRELOAD ---");
        return res.json({
          code: Code.FAIL,
          data: preload
        });
      }
    } catch (e) {
      console.error(e);
      logger.error(e);
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        data: e
      });
    }
  }

  async receipt(req: Request, res: Response) {
    logger.info("--- BEGIN MONERIS RECEIPT ---");
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      logger.info("authentication failed");
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        message: "authentication failed"
      });
    }

    const paymentId = req.body.paymentId;
    const ticket = req.body.ticket;
    logger.info(`paymentId: ${paymentId}, ticket: ${ticket}`);
    logger.info("send receipt request to moneris");
    const receipt = await moneris.receipt(ticket);
    const cc = await this.clientCreditModel.findOne({
      paymentId
    });
    if (!cc) {
      logger.info("client credit not found");
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        message: "client credits empty"
      });
    }
    if (receipt.response.success != BooleanType.TRUE) {
      logger.info("moneris response does not return true");
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        data: receipt
      });
    }
    if (!receipt.response.receipt || !receipt.response.receipt.cc || !receipt.response.receipt.cc.amount) {
      logger.info("moneris receipt response is invalid");
      logger.info("--- END MONERIS PRELOAD ---");
      return res.json({
        code: Code.FAIL,
        data: receipt
      });
    }
    logger.info("processAfterPay");
    await this.orderModel.processAfterPay(paymentId, PaymentAction.PAY.code, parseFloat(receipt.response.receipt?.cc?.amount || "0"), ticket);
    cc.status = PaymentStatus.PAID;
    logger.info("set client credit status paid");
    await this.clientCreditModel.updateOne({ _id: cc._id }, cc);
    logger.info("--- END MONERIS PRELOAD ---");
    return res.json({
      code: Code.SUCCESS
    });
  }

  async monerisPay(req: Request, res: Response) {
    logger.info('--- BEGIN MONERIS HT PAY ---');
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      logger.info("authentication failed");
      logger.info("--- END MONERIS HT PAY ---");
      return res.json({
        code: Code.FAIL,
        message: "authentication failed"
      });
    }
    if (!req.body.cc) {
      return res.json({
        code: Code.FAIL,
        message: 'credit_cart_empty'
      });
    }
    if (!req.body.cvd) {
      return res.json({
        code: Code.FAIL,
        message: 'cvd_empty'
      });
    }
    if (!req.body.exp) {
      return res.json({
        code: Code.FAIL,
        message: 'exp_empty'
      });
    }
    req.body.cc = req.body.cc.replace(/\s/g, '');
    req.body.exp = req.body.exp.replace(/(\s|\/)/g, '');
    req.body.cvd = req.body.cvd.replace(/\s/g, '');
    if (!/^\d{12,20}$/.test(req.body.cc)) {
      return res.json({
        code: Code.FAIL,
        msg: 'invalid_card_number'
      })
    }
    if (!/^\d{4}$/.test(req.body.exp)) {
      return res.json({
        code: Code.FAIL,
        msg: 'invalid_exp'
      })
    }
    if (!/^\d{3}$/.test(req.body.cvd)) {
      return res.json({
        code: Code.FAIL,
        msg: 'invalid_cvd'
      });
    }
    const paymentId = req.body.paymentId;
    logger.info("paymentId: " + paymentId);
    const orders: Array<IOrder> = await this.orderModel.find({
      paymentId,
      status: OrderStatus.TEMP
    });
    if (!orders || !orders.length) {
      logger.info("orders empty");
      logger.info("--- END MONERIS HT PAY ---");
      return res.json({
        code: Code.FAIL,
        msg: "cannot find orders"
      });
    }
    try {
      await this.orderModel.validateOrders(orders);
    } catch (e) {
      logger.info("--- END MONERIS HT PAY ---");
      return res.json({
        code: Code.FAIL,
        data: e
      });
    }
    let total = 0;
    orders.forEach((order: IOrder) => {
      total += order.total;
    });
    logger.info(`total order price: ${total}`);
    logger.info(`account balalnce: ${account.balance}`)
    if (account.balance) {
      total -= Number(account.balance);
    }
    logger.info(`total payable: ${total}`);
    if (total <= 0) {
      logger.warning('Total amount is below zero');
      logger.info("--- END MONERIS HT PAY ---");
      return res.json({
        code: Code.FAIL,
        msg: 'payment_failed'
      });
    }
    let cc = {
      accountId: account._id,
      accountName: account.username,
      total,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      note: "",
      paymentId,
      status: PaymentStatus.UNPAID
    };
    logger.info("inserting client credit");
    await this.clientCreditModel.insertOne(cc);
    let resp;
    try {
      resp = await monerisHt.send({
        type: 'purchase',
        crypt_type: 7,
        order_id: paymentId + "_" + moment().tz("America/Toronto").format("MMDDHHmmss"),
        amount: Number(total).toFixed(2),
        pan: req.body.cc,
        expdate: this.convertMMYYtoYYMM(req.body.exp),
        description: `User: ${account.username}, PaymentID: ${paymentId}, Total: ${total}, Deliver Date: ${orders[0].deliverDate}`,
        cust_id: `${account._id.toString()}`,
        cvd_info: {
          cvd_indicator: "1",
          cvd_value: req.body.cvd,
        }
      });
      
    } catch (e) {
      console.error(e);
      logger.error('Moneris pay error: ' + e);
      logger.info("--- END MONERIS HT PAY ---");
      return res.json({
        code: Code.FAIL,
        msg: 'payment_failed'
      });
    }
    const code = fe(resp.ResponseCode);
    const status = {
        msg: fe(resp.Message),
        code,
        reference: fe(resp.ReferenceNum),
        iso: fe(resp.ISO),
        receipt: fe(resp.ReceiptId),
        raw: resp,
        isVisa: fe(resp.CardType,"V"),
        isMasterCard: fe(resp.CardType,"M"),
        isVisaDebit: fe(resp.IsVisaDebit,"true"),
        authCode: fe(resp.AuthCode),
        timeout: fe(resp.TimedOut,"true"),
        date: fe(resp.TransDate),
        time: fe(resp.TransTime)
    };
    const approved =  !status.timeout && ((code)=="00" || code ? parseInt(code)<50 : false );
    logger.info(`Moneris response: Message: ${status.msg}, Code: ${status.code}, Reference: ${status.reference}, ISO: ${status.iso}, timeout: ${status.timeout}, Approved: ${approved}`)
    if (!approved) {
      logger.info('Not approved');
      logger.info("--- END MONERIS HT PAY ---");
      return res.json({
        code: Code.FAIL,
        msg: this.getMonerisErrorMessage(status.code),
        mcode: {
          iso: status.iso,
          code: status.code
        }
      });
    }
    logger.info("processAfterPay");
    await this.orderModel.processAfterPay(paymentId, PaymentAction.PAY.code, total, resp.reference);
    cc.status = PaymentStatus.PAID;
    logger.info("set client credit status paid");
    await this.clientCreditModel.updateOne({ paymentId: cc.paymentId, status: PaymentStatus.UNPAID }, cc);
    logger.info("--- END MONERIS PRELOAD ---");
    return res.json({
      code: Code.SUCCESS,
      err: PaymentError.NONE
    });
  }

  async alphaPayQRCode(req: Request, res: Response) {
    return this.alphaPay(req, res, "qrcode");
  }

  async alphaPayH5(req: Request, res: Response) {
    return this.alphaPay(req, res, "h5");
  }

  async alphaPayJsApi(req: Request, res: Response) {
    return this.alphaPay(req, res, "jsapi");
  }

  async alphaPay(req: Request, res: Response, gateway: "qrcode" | "jsapi" | "h5") {
    logger.info("--- BEGIN ALPHA PAY---");
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      logger.info("authentication failed");
      logger.info('---  END ALPHAPAY  ---');
      return res.json({
        code: Code.FAIL,
        message: "authentication failed"
      });
    }
    const paymentId = req.body.paymentId;
    let channel;
    switch (req.body.channel) {
      case 'alipay':
        channel = ChannelType.ALIPAY;
        break;
      case 'unionpay':
        channel = ChannelType.UNION_PAY;
        break;
      default:
        channel = ChannelType.WECHAT;
    }
    logger.info("paymentId: " + paymentId + " " + "Channel: " + channel + " " + "Gateway: " + gateway);
    const orders: Array<IOrder> = await this.orderModel.find({
      paymentId,
      status: OrderStatus.TEMP
    });
    if (!orders || !orders.length) {
      logger.info("orders empty");
      logger.info('---  END ALPHAPAY  ---');
      return res.json({
        code: Code.FAIL,
        msg: "cannot find orders"
      });
    }
    try {
      await this.orderModel.validateOrders(orders);
    } catch (e) {
      logger.info('---  END ALPHAPAY  ---');
      return res.json({
        code: Code.FAIL,
        data: e
      });
    }
    let total = 0;
    orders.forEach((order: IOrder) => {
      total += order.total;
    });
    logger.info(`total order price: ${total}`);
    logger.info(`account balalnce: ${account.balance}`)
    if (account.balance) {
      total -= Number(account.balance);
    }
    logger.info(`total payable: ${total}`);
    if (total <= 0) {
      logger.warning('Total amount is below zero');
      logger.info('---  END ALPHAPAY  ---');
      return res.json({
        code: Code.FAIL,
        msg: 'payment_failed'
      });
    }
    let cc = {
      accountId: account._id,
      accountName: account.username,
      total,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      note: "",
      paymentId,
      status: PaymentStatus.UNPAID
    };
    logger.info("inserting client credit");
    await this.clientCreditModel.insertOne(cc);
    let resp;
    try {
      const reqData = {
        description: `User: ${account.username}, PaymentID: ${paymentId}, Total: ${total}, Deliver Date: ${orders[0].deliverDate}`,
        price: Number((total * 100).toFixed(0)),
        currency: CurrencyType.CAD,
        notify_url: "https://duocun.com.cn/api/ClientPayments/alphapay/success",
        //@ts-ignore
        channel
      };
      try {
        switch(gateway) {
          case "qrcode":
            resp = await alphapay.createQRCodePayment(paymentId, reqData);
            break;
          case "h5":
            //@ts-ignore
            resp = await alphapay.createH5Payment(paymentId, reqData);
            break;
          case "jsapi":
            //@ts-ignore
            resp = await alphapay.createJSAPIPayment(paymentId, reqData);
            break;
        }
      } catch(e) {
        logger.error(e);
        logger.info('---  END ALPHAPAY  ---');
        return res.json({
          code: Code.FAIL,
          msg: 'payment_failed'
        })
      }
      if (resp.return_code != 'SUCCESS') {
        // @ts-ignore
        logger.error("alphapay failed, return code: " + resp.return_code + ", message: "  + resp.return_msg)
        logger.info('---  END ALPHAPAY  ---');
        return res.json({
          code: Code.FAIL,
          msg: 'payment_failed'
        });
      }
      let redirectUrl;
      let successUrl = `https://duocun.ca/test/payment-success?channel=${channel}&paymentId=${paymentId}`;
      switch(gateway) {
        case "qrcode":
          redirectUrl = alphapay.getQRCodePaymentPageUrl(paymentId, successUrl);
          break;
        case "h5":
          redirectUrl = alphapay.getH5PaymentPage(paymentId, successUrl);
          break;
        case "jsapi":
          if (channel == ChannelType.ALIPAY) {
            redirectUrl = alphapay.getAlipayJSAPIPaymentPageUrl(paymentId, successUrl);
          } else {
            redirectUrl = alphapay.getWechatJSAPIPaymentPageUrl(paymentId, successUrl);
          }
          break;
        default: break;
      }
      return res.json({
        code: Code.SUCCESS,
        data: resp,
        redirect_url: redirectUrl
      });
    } catch(e) {
      logger.error(e);
      logger.info('---  END ALPHAPAY H5  ---');
      return res.json({
        code: Code.FAIL,
        msg: 'payment_failed'
      });
    }
  }

  async handleAlphapayNotification(req: Request, res: Response) {
    logger.info("--- BEGIN ALPHAPAY SUCCESS NOTIFICATION ---");
    const notification: SuccessNotification = req.body;
    if (!alphapay.isNotificationValid(notification)) {
      logger.info("---  END ALPHAPAY SUCCESS NOTIFICATION  ---");
      logger.info("Alphapay notification is invalid");
      logger.info(JSON.stringify(notification));
      return;
    }
    const paymentId = notification.partner_order_id;
    await this.orderModel.processAfterPay(paymentId, PaymentAction.PAY.code, Number(notification.real_fee) / 100, '');
    logger.info("---  END ALPHAPAY SUCCESS NOTIFICATION  ---");
  }

  async checkPayment(req: Request, res: Response) {
    const paymentId = req.body.paymentId;
    const account = await this.getCurrentUser(req, res);
    if (!account) {
      return res.json({
        code: Code.FAIL
      });
    }
    if (!paymentId) {
      return res.json({
        code: Code.FAIL
      });
    }
    const orders = await this.orderModel.find({ paymentId, clientId: account._id.toString() });
    if (!orders || !orders.length) {
      console.log('order empty');
      return res.json({
        code: Code.FAIL
      });
    }
    if (orders[0].paymentStatus == PaymentStatus.PAID) {
      return res.json({
        code: Code.SUCCESS
      });
    } else {
      console.log('order unpaid');
      return res.json({
        code: Code.FAIL
      });
    }
  }

  getMonerisErrorMessage(code: string) {
    let codeTable = {
      "051": "card_expired",
      "057": "card_stolen",
      "058": "card_invalid_status",
      "059": "card_restricted",
      "076": "card_low_funds",
      "105": "card_not_supported",
      "200": "card_invalid_account",
      "208": "card_invalid_expiration_date",
      "408": "card_limited",
      "475": "card_invalid_expiration_date",
      "476": "card_declined",
      "477": "card_invalid_number",
      "481": "card_declined",
      "482": "card_expired",
      "486": "cvv_invalid",
      "487": "cvv_invalid",
      "489": "cvv_invalid",
      "490": "cvv_invalid"
    };
    // @ts-ignore
    return codeTable[code] || "payment_failed"
  }

  convertMMYYtoYYMM(exp: string) {
    return `${exp.charAt(2)}${exp.charAt(3)}${exp.charAt(0)}${exp.charAt(1)}`
  }

}


