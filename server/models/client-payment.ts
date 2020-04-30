import { DB } from "../db";
import { Model } from "./model";
import { Request, Response } from "express";
import { Entity } from "../entity";
import { Config } from "../config";
import { IncomingMessage } from "http";
import https from "https";
// import NodeRSA from 'node-rsa';
import { Md5 } from "ts-md5";
import moment, { now } from "moment";
import {
  Order,
  OrderType,
  PaymentStatus,
  PaymentMethod,
  OrderStatus,
} from "../models/order";
import { Transaction, TransactionAction, IDbTransaction } from "./transaction";
import { Merchant } from "./merchant";
import { ClientCredit } from "./client-credit";
import { CellApplication, CellApplicationStatus } from "./cell-application";
import { EventLog } from "./event-log";
import { ObjectID } from "mongodb";
import { Account } from "./account";
import { SystemConfig } from "./system-config";

import log from "../lib/logger";
import { Product } from "./product";
import {Location} from "./location";

const CASH_BANK_ID = "5c9511bb0851a5096e044d10";
const CASH_BANK_NAME = "Cash Bank";
const TD_BANK_ID = "5c95019e0851a5096e044d0c";
const TD_BANK_NAME = "TD Bank";
const SNAPPAY_BANK_ID = "5e60139810cc1f34dea85349";
const SNAPPAY_BANK_NAME = "SnapPay Bank";

// var fs = require('fs');
// var util = require('util');
// // var log_file = fs.createWriteStream('~/duocun-debug.log', {flags : 'w'}); // __dirname +
// var log_stdout = process.stdout;

// console.log = function (d: any) { //
//   // log_file.write(util.format(d) + '\n');
//   log_stdout.write(util.format(d) + '\n');
// };
export const PaymentError = {
  NONE: "N",
  PHONE_EMPTY: "PE",
  LOCATION_EMPTY: "LE",
  DUPLICATED_SUBMIT: "DS",
  CART_EMPTY: "CE",
  BANK_CARD_EMPTY: "BE",
  INVALID_BANK_CARD: "IB",
  BANK_CARD_FAIL: "BF",
  WECHATPAY_FAIL: "WF",
  CREATE_BANK_CUSTOMER_FAIL: "CBCF",
  BANK_INSUFFICIENT_FUND: "BIF",
  BANK_CARD_DECLIEND: "BCD",
  INVALID_ACCOUNT: "IA",
  BANK_AUTHENTICATION_REQUIRED: "BAR",
  PAYMENT_METHOD_ID_MISSING: "IDM",
};

export const PaymentAction = {
  PAY: { code: "P", text: "Pay" },
  ADD_CREDIT: { code: "A", text: "Add Credit" },
};

export const ResponseStatus = {
  SUCCESS: "S",
  FAIL: "F",
};

export interface IPaymentResponse {
  status: string; // ResponseStatus
  code: string; // stripe/snappay return code
  decline_code: string; // strip decline_code
  msg: string; // stripe/snappay retrun message
  chargeId: string; // stripe { chargeId:x }
  url: string; // snappay {url: data[0].h5pay_url} //  { code, data, msg, total, psn, sign }
}

export interface IStripeError {
  type: string;
  code: string;
  decline_code: string;
  message: string;
  param: string;
  payment_intent: any;
}

export class ClientPayment extends Model {
  cfg: Config;
  orderEntity: Order;
  transactionModel: Transaction;
  merchantModel: Merchant;
  clientCreditModel: ClientCredit;
  cellApplicationModel: CellApplication;
  eventLogModel: EventLog;
  accountModel: Account;
  productModel: Product;
  locationModel: Location;
  cfgModel: SystemConfig;

  constructor(dbo: DB) {
    super(dbo, "client_payments");
    this.accountModel = new Account(dbo);
    this.orderEntity = new Order(dbo);
    this.productModel = new Product(dbo);
    this.merchantModel = new Merchant(dbo);
    this.transactionModel = new Transaction(dbo);
    this.clientCreditModel = new ClientCredit(dbo);
    this.cellApplicationModel = new CellApplication(dbo);
    this.eventLogModel = new EventLog(dbo);
    this.cfgModel = new SystemConfig(dbo);
    this.locationModel = new Location(dbo);
    this.cfg = new Config();
  }

  getPaymentList(orders: any[]){
    const paymentMap: any = {};
    
    orders.forEach((order: any) => {
      const paymentId = order.paymentId.toString();
      const created = order.created;
      const client = order.client;
      const address = this.locationModel.getAddrString(order.location)
      paymentMap[paymentId] = {paymentId, client, address, created, orders:[]};
    });
    orders.forEach((order: any) => {
      const paymentId = order.paymentId.toString();
      paymentMap[paymentId].orders.push(order);
    });

    const rs: any = [];
    Object.keys(paymentMap).forEach(paymentId => {
      const it = paymentMap[paymentId];
      const deliverMap = this.groupOrdersByDeliver(it.orders);
      
      const delivers: any[] = [];
      let totalPrice = 0;
      let totalTax = 0;
      Object.keys(deliverMap).forEach(deliverDate => {
        let price = 0;
        let total = 0;
        let tax = 0;
        const deliver = deliverMap[deliverDate];
        const merchants: any = [];
        const mMap = this.groupOrdersByMerchant(deliver.orders);
        Object.keys(mMap).forEach(mId => {
          const name = mMap[mId].name;
          const order = mMap[mId].order;
          price += order.price;
          total += order.total;
          tax += order.taxt;
          merchants.push({ name, items: order.items });
        });
        delivers.push({deliverDate, merchants, price, tax, total,
          deliveryCost: 0,
          deliveryDiscount: 0,
          groupDiscount: 0,
          overRangeCharge: 0
         });

         totalPrice += price;
         totalTax += tax;
      });
      rs.push({paymentId, created: it.created, delivers, price: totalPrice, tax: totalTax, total: totalPrice + totalTax});
    });

    return rs;
  }


  // helper
  groupOrdersByDeliver(orders: any[]){
    const deliverMap:any = {};
    orders.forEach((order: any) => {
      const date = order.deliverDate;
      const time = order.deliverTime;
      deliverMap[date] = {date, time, orders:[]};
    });
    orders.forEach((order: any) => {
      const date = order.deliverDate;
      deliverMap[date].orders.push(order);
    });
    return deliverMap;
  }

  
  // orders --- filter by payment and deliver
  groupOrdersByMerchant(orders: any[]) {
    const mMap: any = {};
    orders.forEach((order: any) => {
      const merchantId = order.merchantId;
      const name = order.merchant.name;
      mMap[merchantId] = { name, order }; // only one order !
    });
    return mMap;
  }

  // return [{paymentId, created, delivers:[{date, time, orders}]} ...]
  async getHistory(clientId: string, itemsPerPage: number, currentPageNumber: number) {
    const query = { clientId, status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] } };
    const r = await this.orderEntity.join_find_v2(query);
    const payments = this.getPaymentList(r.data);

    const arrSorted = payments.sort((a: any, b: any) => {
      const ca = moment(a.created);
      const cb = moment(b.created);
      if (ca.isAfter(cb)) {
        return -1;
      } else {
        return 1;
      }
    });

    const start = (currentPageNumber - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const data = arrSorted.slice(start, end);

    return { count: arrSorted.length, data };
  }

  // paymentActionCode --- code of PaymentAction
  async payBySnappay(paymentActionCode: string, appCode: string, accountId: string, amount: number, returnUrl: string, paymentId: string, merchantNames:string[]) {
    if (paymentActionCode === PaymentAction.PAY.code) {
      const description: any = (merchantNames && merchantNames.length>0) ? merchantNames.join(',') : 'N/A';
      // returnUrl = 'https://duocun.com.cn/cell?clientId=' + clientId + '&paymentMethod=' + paymentMethod + '&page=application_form';

      const rsp: any = await this.snappayPay(
        accountId,
        appCode,
        paymentActionCode,
        amount,
        returnUrl,
        description,
        paymentId
      );

      if (rsp && rsp.status === ResponseStatus.FAIL) {
        return { ...rsp, err: PaymentError.WECHATPAY_FAIL };
      } else {
        return { ...rsp, err: PaymentError.NONE };
      }
    } else {
      // to be done
      return { status: ResponseStatus.FAIL, err: PaymentError.BANK_CARD_DECLIEND };
      // add credit
      // if (amount > 0) {
      //   const paymentId = new ObjectID().toString();
      //   const cc = {
      //     accountId,
      //     accountName,
      //     total: Math.round(amount * 100) / 100,
      //     paymentMethod,
      //     note,
      //     paymentId,
      //     status: PaymentStatus.UNPAID,
      //   };

      //   this.clientCreditModel.insertOne(cc).then((c) => {
      //     // returnUrl = 'https://duocun.com.cn/cell?clientId=' + accountId + '&paymentMethod=' + paymentMethod + '&page=application_form';
      //     this.snappayPay(
      //       accountId,
      //       appCode,
      //       paymentActionCode,
      //       amount,
      //       "Add Credit",
      //       paymentId
      //     ).then((rsp: any) => {
      //       if (rsp && rsp.status === ResponseStatus.FAIL) {
      //         const r = { ...rsp, err: PaymentError.WECHATPAY_FAIL };
      //         res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
      //       } else {
      //         const r = { ...rsp, err: PaymentError.NONE };
      //         res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
      //       }
      //     });
      //   });
      // } else {
      //   res.send(JSON.stringify(null, null, 3));
      // }
    }
  }


  // appCode --- '122':grocery, '123':food delivery
  // paymentActionCode --- P: Pay, A: Add credit
  // paymentId --- paymentId represent a batch of orders
  getSnappayData(
    appCode: string,
    paymentActionCode: string,
    accountId: string,
    paymentId: string,
    amount: number,
    returnUrl: string,
    description: string
  ) {
    // const cfgs = await this.cfgModel.find({});
    // const cfg = cfgs[0];
    // const method = cfg.snappay.methods.find((m: any) => m.code = 'WECHATPAY');
    // const app = method.apps.find((a: any) => a.code === appCode);
    // const notify_url = app ? app.notifyUrl : ''; // 'https://duocun.com.cn/api/ClientPayments/notify';
    // const returnUrl = app ? app.returnUrls.find((r: any) => r.action === paymentActionCode) : { url: '' }; 'https://duocun.ca/grocery?p=h&cId='
    // const return_url = returnUrl.url + accountId; // 'https://duocun.ca/grocery?p=h&cId=' + accountId;
    const return_url = returnUrl ? returnUrl : "https://duocun.ca/grocery?p=h&cId=" + accountId;
    const notify_url = "https://duocun.com.cn/api/ClientPayments/notify";
    const trans_amount = Math.round(amount * 100) / 100;

    return {
      // the order matters
      app_id: this.cfg.SNAPPAY.APP_ID, // Madatory
      charset: "UTF-8", // Madatory
      description: description, // Service Mandatory
      format: "JSON", // Madatory
      merchant_no: this.cfg.SNAPPAY.MERCHANT_ID, // Service Mandatory
      method: "pay.h5pay", // pc+wechat: 'pay.qrcodepay', // PC+Ali: 'pay.webpay' qq browser+Wechat: pay.h5pay,
      notify_url, // 'https://duocun.com.cn/api/ClientPayments/notify',
      out_order_no: paymentId, // Service Mandatory
      payment_method: "WECHATPAY", // paymentMethod, // WECHATPAY, ALIPAY, UNIONPAY
      return_url,
      trans_amount, // Service Mandatory
      // trans_currency: 'CAD',
      version: "1.0", // Madatory
    };
  }

  async addLogToDB(accountId: string, type: string, code: string, message: string) {
    const eventLog = {
      accountId,
      type,
      code: code,
      decline_code: "",
      message,
      created: moment().toISOString(),
    };
    await this.eventLogModel.insertOne(eventLog);
    return;
  }

  // This request could response multiple times !!!
  async processSnappayNotify(paymentId: string, amount: number) {
    const paymentActionCode = TransactionAction.PAY_BY_WECHAT.code;
    await this.orderEntity.processAfterPay(paymentId, paymentActionCode, amount, '');
    return;
  }

  // return {status, code, declient_code, msg, chargeId, url}
  snappayPay(
    accountId: string,
    appCode: string,
    paymentActionCode: string,
    amount: number,
    returnUrl: string,
    description: string,
    paymentId: string
  ) {
    const self = this;

    return new Promise((resolve, reject) => {
      const data = this.getSnappayData(
        appCode,
        paymentActionCode,
        accountId,
        paymentId,
        amount,
        returnUrl,
        description
      );
      const params = this.snappaySignParams(data);
      const options = {
        hostname: "open.snappay.ca",
        port: 443,
        path: "/api/gateway",
        method: "POST",
        headers: {
          "Content-Type": "application/json", // 'Content-Length': Buffer.byteLength(data)
        },
      };

      const message = "paymentId:" + paymentId + ", params:" + JSON.stringify(params)
      this.addLogToDB(accountId, "snappay req", '', message).then(() => { });

      const post_req = https.request(options, (res: IncomingMessage) => {
        let ss = "";
        res.on("data", (d) => {
          ss += d;
        });
        res.on("end", (r: any) => {
          if (ss) { // { code, data, msg, total, psn, sign }
            const ret = JSON.parse(ss); // s.data = {out_order_no:x, merchant_no:x, trans_status:x, h5pay_url}
            const code = ret ? ret.code : "";
            const message = "sign:" + (ret ? ret.sign : "N/A") + ", msg:" + (ret ? ret.msg : "N/A");
            const rsp: IPaymentResponse = {
              status: ret && ret.msg === "success" ? ResponseStatus.SUCCESS : ResponseStatus.FAIL,
              code, // stripe/snappay code
              decline_code: "", // stripe decline_code
              msg: message, // stripe/snappay retrun message
              chargeId: "", // stripe { chargeId:x }
              url: ret.data && ret.data[0] ? ret.data[0].h5pay_url : "", // snappay data[0].h5pay_url
            };
            if (ret && ret.msg === "success") {
              resolve(rsp);
            } else {
              this.addLogToDB(accountId, "snappay rsp", '', message).then(() => {
                resolve(rsp);
              });
            }
          } else {
            const rsp: IPaymentResponse = {
              status: ResponseStatus.FAIL,
              code: "UNKNOWN_ISSUE", // snappay return code
              decline_code: "", // stripe decline_code
              msg: "UNKNOWN_ISSUE", // snappay retrun message
              chargeId: "", // stripe { chargeId:x }
              url: "", // for snappay data[0].h5pay_url
            };
            resolve(rsp);
          }
        });
      });

      post_req.on("error", (error: any) => {
        const message = JSON.stringify(error);
        self.addLogToDB(accountId, 'snappay error', '', message).then(() => {
          // Reject on request error.
          const rsp: IPaymentResponse = {
            status: ResponseStatus.FAIL,
            code: "UNKNOWN_ISSUE", // snappay return code
            decline_code: "", // stripe decline_code
            msg: message, // snappay retrun message
            chargeId: "", // stripe { chargeId:x }
            url: "", // for snappay data[0].h5pay_url
          };
          resolve(rsp);
        });

      });
      post_req.write(JSON.stringify(params));
      post_req.end();
    });
  }

  async stripeCreateCustomer(paymentMethodId: string) {
    const stripe = require("stripe")(this.cfg.STRIPE.API_KEY);
    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
    });
    const customerId = customer.id;
    return { customerId, err: PaymentError.NONE };
  }

  // metadata eg. { orderId: orderId, customerId: clientId, customerName: order.clientName, merchantName: order.merchantName };
  async stripePay(
    paymentMethodId: string,
    accountId: string,
    amount: number,
    currency: string,
    description: string,
    metadata: any
  ) {
    const stripe = require("stripe")(this.cfg.STRIPE.API_KEY);
    const rt = await this.stripeCreateCustomer(paymentMethodId);
    const customerId = rt.customerId;
    if (rt.err === PaymentError.NONE && customerId) {
      try {
        await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency,
          customer: customerId,
          payment_method: paymentMethodId,
          error_on_requires_action: true,
          confirm: true,
          description,
          metadata,
        });
        return { status: ResponseStatus.SUCCESS, err: rt.err };
      } catch (err) {
        // if (err.raw && err.raw.payment_intent) {
        //   const paymentIntentRetrieved = await stripe.paymentIntents.retrieve(
        //     err.raw.payment_intent.id
        //   );
        //   if(paymentIntentRetrieved){
        //     console.log('PI retrieved: ', paymentIntentRetrieved.id);
        //   }
        // }

        // add log into DB
        const type = err ? err.type : "";
        const code = err ? err.code : "N/A";
        const decline_code = err ? err.decline_code : "N/A";
        const message = 'type:' + type + ', code:' + code + ', decline_code' + decline_code + ', msg: ' + err ? err.message : "N/A";
        await this.addLogToDB(accountId, "stripe error", '', message);

        let error = PaymentError.BANK_CARD_DECLIEND;
        if (err && err.code) {
          if (err.code === "authentication_required") {
            error = PaymentError.BANK_AUTHENTICATION_REQUIRED;
          }
        }
        return { status: ResponseStatus.FAIL, err: error };
      }
    } else {
      return { status: ResponseStatus.FAIL, err: rt.err };
    }
  }


  snappaySignParams(data: any) {
    const sParams = this.createLinkstring(data);
    const encrypted = Md5.hashStr(sParams + this.cfg.SNAPPAY.MD5_KEY);
    data["sign"] = encrypted;
    data["sign_type"] = "MD5";
    return data;
  }



  async payByStripe(paymentActionCode: string, paymentMethodId: string, accountId: string, accountName: string,
 amount: number, note: string, paymentId: string, merchantNames: string[]) {
    // const appType = req.body.appType;


    let metadata = {};
    let description = "";
    
    if (paymentActionCode === PaymentAction.PAY.code) {
      metadata = { paymentId };
      description = accountName + " - " + merchantNames.join(',');
    } else {
      metadata = { customerId: accountId, customerName: accountName };
      description = accountName + "add credit";
    }

    const rsp = await this.stripePay(
      paymentMethodId,
      accountId,
      amount,
      "cad",
      description,
      metadata
    );

    const cc = {
      accountId,
      accountName,
      total: Math.round(amount * 100) / 100,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      note,
      paymentId: paymentId ? paymentId : new ObjectID().toString(),
      status: PaymentStatus.UNPAID,
    };

    if (rsp.err === PaymentError.NONE) {
      const c = await this.clientCreditModel.insertOne(cc);
      await this.orderEntity.processAfterPay(
          paymentId,
          TransactionAction.PAY_BY_CARD.code,
          amount,
          '' // rsp.chargeId
        );
      return rsp;
    } else {
      return rsp;
    }
  }


  getChargeSummary(orders: any[]) {
    let price = 0;
    let cost = 0;

    if (orders && orders.length > 0) {
      orders.map((order: any) => {
        order.items.map((x: any) => {
          price += x.price * x.quantity;
          cost += x.cost * x.quantity;
        });
      });
    }

    return { price, cost };
  }

  // deprecated
  // each order has a paymentId
  // payBySnappay(req: Request, res: Response) {
  //   const appCode = req.body.appCode;
  //   const orders = req.body.orders;
  //   const paymentActionCode =
  //     orders && orders.length > 0
  //       ? PaymentAction.PAY.code
  //       : PaymentAction.ADD_CREDIT.code;
  //   const accountId = req.body.accountId;
  //   const accountName = req.body.accountName;
  //   const note = req.body.note;
  //   const paymentMethod = PaymentMethod.WECHAT; // orders[0].paymentMethod;
  //   let amount = Math.round(+req.body.amount * 100) / 100;

  //   res.setHeader("Content-Type", "application/json");

  //   if (paymentActionCode === PaymentAction.PAY.code) {
  //     // pay order
  //     const order = orders[0];
  //     const paymentId = order.paymentId;
  //     const description = order.merchantName;
  //     // returnUrl = 'https://duocun.com.cn/cell?clientId=' + clientId + '&paymentMethod=' + paymentMethod + '&page=application_form';

  //     this.snappayPay(
  //       accountId,
  //       appCode,
  //       paymentActionCode,
  //       amount,
  //       description,
  //       paymentId
  //     ).then((rsp: any) => {
  //       if (rsp && rsp.status === ResponseStatus.FAIL) {
  //         const r = { ...rsp, err: PaymentError.WECHATPAY_FAIL };
  //         res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
  //       } else {
  //         this.orderEntity
  //           .processAfterPay(
  //             paymentId,
  //             TransactionAction.PAY_BY_WECHAT.code,
  //             amount,
  //             ""
  //           )
  //           .then(() => {
  //             const r = { ...rsp, err: PaymentError.NONE };
  //             res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
  //           });
  //       }
  //     });
  //   } else {
  //     // add credit
  //     if (amount > 0) {
  //       const paymentId = new ObjectID().toString();
  //       const cc = {
  //         accountId,
  //         accountName,
  //         total: Math.round(amount * 100) / 100,
  //         paymentMethod,
  //         note,
  //         paymentId,
  //         status: PaymentStatus.UNPAID,
  //       };

  //       this.clientCreditModel.insertOne(cc).then((c) => {
  //         // returnUrl = 'https://duocun.com.cn/cell?clientId=' + accountId + '&paymentMethod=' + paymentMethod + '&page=application_form';
  //         this.snappayPay(
  //           accountId,
  //           appCode,
  //           paymentActionCode,
  //           amount,
  //           "Add Credit",
  //           paymentId
  //         ).then((rsp: any) => {
  //           if (rsp && rsp.status === ResponseStatus.FAIL) {
  //             const r = { ...rsp, err: PaymentError.WECHATPAY_FAIL };
  //             res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
  //           } else {
  //             const r = { ...rsp, err: PaymentError.NONE };
  //             res.send(JSON.stringify(r, null, 3)); // IPaymentResponse
  //           }
  //         });
  //       });
  //     } else {
  //       res.send(JSON.stringify(null, null, 3));
  //     }
  //   }
  // }

  // deprecated
  // each order has a paymentId
  // payByCreditCard(req: Request, res: Response) {
  //   // const appType = req.body.appType;
  //   const paymentMethodId = req.body.paymentMethodId;
  //   const accountId = req.body.accountId;
  //   const accountName = req.body.accountName;
  //   const orders = req.body.orders;
  //   const note = req.body.note;
  //   let amount = +req.body.amount;
  //   let metadata = {};
  //   let description = "";
  //   let paymentId = new ObjectID().toString();

  //   res.setHeader("Content-Type", "application/json");

  //   if (orders && orders.length > 0) {
  //     // pay order
  //     const order = orders[0];
  //     // const orderIds = orders.map((order: any) => order._id);;
  //     // let { price, cost } = this.getChargeSummary(orders);
  //     metadata = { paymentId: order.paymentId };
  //     description = accountName + " pay " + orders[0].merchantName;
  //     paymentId = order.paymentId;
  //   } else {
  //     metadata = { customerId: accountId, customerName: accountName };
  //     description = accountName + "add credit";
  //   }

  //   this.stripePay(
  //     paymentMethodId,
  //     accountId,
  //     amount,
  //     "cad",
  //     description,
  //     metadata
  //   ).then((rsp: any) => {
  //     const cc = {
  //       accountId,
  //       accountName,
  //       total: Math.round(amount * 100) / 100,
  //       paymentMethod: PaymentMethod.CREDIT_CARD,
  //       note,
  //       paymentId,
  //       status: PaymentStatus.UNPAID,
  //     };

  //     if (rsp.err === PaymentError.NONE) {
  //       this.clientCreditModel.insertOne(cc).then((c) => {
  //         this.orderEntity
  //           .processAfterPay(
  //             paymentId,
  //             TransactionAction.PAY_BY_CARD.code,
  //             amount,
  //             rsp.chargeId
  //           )
  //           .then(() => {
  //             res.send(JSON.stringify(rsp, null, 3)); // IPaymentResponse
  //           });
  //       });
  //     } else {
  //       res.send(JSON.stringify(rsp, null, 3)); // IPaymentResponse
  //     }
  //   });
  // }

  createLinkstring(data: any) {
    let s = "";
    Object.keys(data).map((k) => {
      s += k + "=" + data[k] + "&";
    });
    return s.substring(0, s.length - 1);
  }




}
