import { Request, Response } from "express";
import { DB } from "../db";
import { Model } from "./model";
import { ILocation, Location } from "./location";
import { OrderSequence } from "./order-sequence";
import moment from 'moment';
import { Merchant, IPhase, IMerchant, IDbMerchant } from "./merchant";
import { Account, IAccount } from "./account";

import { Transaction, ITransaction, TransactionAction } from "./transaction";
import { Product, IProduct } from "./product";
import { CellApplication, CellApplicationStatus, ICellApplication } from "./cell-application";
import { Log, Action, AccountType } from "./log";
import { createObjectCsvWriter } from 'csv-writer';
import { ObjectID } from "mongodb";
import { ClientCredit } from "./client-credit";
import fs from "fs";
import { EventLog } from "./event-log";
import { PaymentAction } from "./client-payment";

const CASH_ID = '5c9511bb0851a5096e044d10';
const CASH_NAME = 'Cash';
const BANK_ID = '5c95019e0851a5096e044d0c';
const BANK_NAME = 'TD Bank';

const CASH_BANK_ID = '5c9511bb0851a5096e044d10';
const CASH_BANK_NAME = 'Cash Bank';
const TD_BANK_ID = '5c95019e0851a5096e044d0c';
const TD_BANK_NAME = 'TD Bank';
const SNAPPAY_BANK_ID = '5e60139810cc1f34dea85349';
const SNAPPAY_BANK_NAME = 'SnapPay Bank';

export const OrderType = {
  FOOD_DELIVERY: 'F',
  MOBILE_PLAN_SETUP: 'MS',
  MOBILE_PLAN_MONTHLY: 'MM',
  GROCERY: 'G'
};

export const OrderStatus = {
  BAD: 'B',          // client return, compansate
  DELETED: 'D',          // cancellation
  TEMP: 'T',             // generate a temp order for electronic order
  NEW: 'N',
  LOADED: 'L',           // The driver took the food from Merchant
  DONE: 'F',             // Finish delivery
  MERCHANT_CHECKED: 'MC'  // VIEWED BY MERCHANT
};

export const PaymentMethod = {
  CASH: 'CA',
  WECHAT: 'W',
  CREDIT_CARD: 'CC',
  PREPAY: 'P'
};

export const PaymentStatus = {
  UNPAID: 'U',
  PAID: 'P',
  RECEIVING: 'RI'
};


export interface IOrderItem {
  productId: string;
  productName?: string;
  // merchantName?: string;
  price: number;
  cost: number;
  quantity: number;

  product?: IProduct;
}

export interface IOrder {
  _id?: string;
  code?: string;
  clientId: string;
  clientName: string;
  clientPhoneNumber?: string;
  merchantId: string;
  merchantName: string;
  driverId?: string;
  driverName?: string;
  type?: string;        // OrderType

  paymentStatus?: string;
  status?: string;

  note?: string;
  address?: string;
  location: ILocation; // delivery address

  deliverDate?: string;  // deliver date  2020-11-01
  deliverTime?: string;  // deliver time 14:00:00

  delivered?: string;
  created?: string;
  modified?: string;

  utcDelivered?: string;
  utcCreated?: string;
  utcModified?: string;

  items?: IOrderItem[];
  tax?: number;
  tips?: number;
  // deliveryAddress?: Address; // duplicated should remove
  deliveryCost?: number;
  deliveryDiscount?: number;
  overRangeCharge?: number;
  groupDiscount?: number;

  cost: number;
  price: number;
  total: number;
  paymentMethod: string;
  chargeId?: string; // stripe chargeId
  transactionId?: string;
  paymentId?: string;

  mode?: string; // for unit test
  dateType?: string; // 'today', 'tomorrow'

  client?: IAccount;
  driver?: IAccount;
  merchantAccount?: IAccount;
  merchant?: IMerchant;
}

export class Order extends Model {
  private productModel: Product;
  private sequenceModel: OrderSequence;
  private merchantModel: Merchant;
  private accountModel: Account;
  private transactionModel: Transaction;
  private cellApplicationModel: CellApplication;
  private logModel: Log;
  clientCreditModel: ClientCredit;
  eventLogModel: EventLog;
  locationModel: Location;

  constructor(dbo: DB) {
    super(dbo, 'orders');

    this.productModel = new Product(dbo);
    this.sequenceModel = new OrderSequence(dbo);
    this.merchantModel = new Merchant(dbo);
    this.accountModel = new Account(dbo);
    this.transactionModel = new Transaction(dbo);
    this.cellApplicationModel = new CellApplication(dbo);
    this.logModel = new Log(dbo);
    this.clientCreditModel = new ClientCredit(dbo);
    this.eventLogModel = new EventLog(dbo);
    this.locationModel = new Location(dbo);
  }

  // v2 return [{
  //  _id,
  //  client:{ _id, username, phone },
  //  merchant: { _id, name }
  //  items: [{productId, productName, price, cost, quantity}]}];
  async joinFindV2(query: any) {
    let q = query ? query : {};
    const rs = await this.find(q);
    const clientAccountIds = rs.map((r: any) => r.clientId);
    const merchantAccountIds = rs.map((r: any) => r.merchantId);
    const driverAccounts = await this.accountModel.find({ type: 'driver' }, null, ['_id', 'username', 'phone']);
    const clientAccounts = await this.accountModel.find({ _id: { $in: clientAccountIds } }, null, ['_id', 'username', 'phone']);
    const merchantAccounts = await this.accountModel.find({ _id: { $in: merchantAccountIds } }, null, ['_id', 'username', 'merchants']);
    const merchants = await this.merchantModel.find({});
    const ps = await this.productModel.find({});
    rs.map((order: any) => {
      const items: any[] = [];

      if (order.clientId) {
        const c = clientAccounts.find((a: any) => a._id.toString() === order.clientId.toString());
        order.client = { _id: c._id.toString(), username: c.username, phone: c.phone };
      }

      if (order.merchantId) {
        const m = merchants.find((m: any) => m._id.toString() === order.merchantId.toString());
        order.merchant = { _id: m._id.toString(), name: m.name };
      }

      if (order.merchant && order.merchant.accountId) {
        const merchantAccount = merchantAccounts.find((a: any) => a && a._id.toString() === order.merchant.accountId.toString());
        if (merchantAccount) {
          const m = merchantAccount;
          order.merchantAccount = { _id: m._id.toString(), name: m.name };
        }
      }

      if (order.driverId) {
        const driver = driverAccounts.find((a: IAccount) => a._id.toString() === order.driverId.toString());
        const d = driver;
        order.driver = { _id: d._id.toString(), username: d.username, phone: d.phone };
      }

      if (order.items) {
        order.items.map((it: IOrderItem) => {
          const product = ps.find((p: any) => p && p._id.toString() === it.productId.toString());
          if (product) {
            items.push({ ...it, productName: product.name });
          }
        });
        order.items = items;
      }
    });

    return rs.map(r => ({ 
      _id: r._id,
      code: r.code,
      address: this.locationModel.getAddrString(r.location),
      items: r.items,
      price: r.price,
      cost: r.cost,
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      status: r.status,
      client: r.client, 
      merchant: r.merchant,
      // merchantAccount: r.merchantAccount,
      driver: r.driver,
      note: r.note,
      delivered: r.deliverd,
      created: r.creaded
     }));
  }

  // get transactions with items
  async findTransactions(query: any, fields: string[] = []) {
    const ts = await this.transactionModel.find(query, fields);
    if (fields.indexOf('items') !== -1) {
      const ids = ts.map((t: any) => t.orderId);
      const orders = await this.joinFindV2({ _id: { $in: ids } });
      const orderMap: any = {};
      orders.map(order => { orderMap[order._id.toString()] = order.items; });
      ts.map((t: any) => t.items = t.orderId ? orderMap[t.orderId.toString()] : []);
    }
    return this.filterArray(ts, fields);
  }

  reqTransactions(req: Request, res: Response) {
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    let fields: string[] = [];
    if (req.headers && req.headers.fields && typeof req.headers.fields === 'string') {
      fields = (req.headers && req.headers.fields) ? JSON.parse(req.headers.fields) : null;
    }

    res.setHeader('Content-Type', 'application/json');
    this.findTransactions(query, fields).then(xs => {
      res.send(JSON.stringify(xs, null, 3));
    });
  }

  // v1
  list(req: Request, res: Response) {
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    let fields: string[];
    if (req.headers && req.headers.fields && typeof req.headers.fields === 'string') {
      fields = (req.headers && req.headers.fields) ? JSON.parse(req.headers.fields) : null;
    }

    this.joinFind(query).then(rs => {
      const xs = this.filterArray(rs, fields);
      res.setHeader('Content-Type', 'application/json');
      if (rs) {
        res.send(JSON.stringify(xs, null, 3));
      } else {
        res.send(JSON.stringify(null, null, 3));
      }
    });
  }

  joinFind(query: any): Promise<IOrder[]> {
    // if (query.hasOwnProperty('pickup')) {
    //   query.delivered = this.getPickupDateTime(query['pickup']);
    //   delete query.pickup;
    // }
    let q = query ? query : {};

    return new Promise((resolve, reject) => {
      this.accountModel.find({}).then(accounts => {
        this.merchantModel.find({}).then(merchants => {
          this.productModel.find({}).then(ps => {
            this.find(q).then((rs: any) => {
              rs.map((order: any) => {
                const items: any[] = [];
                accounts.map((a: IAccount) => {
                  if (a && a.password) {
                    delete a.password;
                  }
                });

                if (order.clientId) {
                  const client = accounts.find((a: any) => a._id.toString() === order.clientId.toString());
                  if (client) {
                    if (client.password) {
                      delete client.password;
                    }
                    order.client = client;
                  }
                } else {
                  console.log(order._id);
                }

                if (order.merchantId) {
                  order.merchant = merchants.find((m: any) => m._id.toString() === order.merchantId.toString());
                } else {
                  console.log(order._id);
                }

                if (order.merchant && order.merchant.accountId) {
                  const merchantAccount = accounts.find((a: any) => a && order.merchant && a._id.toString() === order.merchant.accountId.toString());
                  if (merchantAccount) {
                    if (merchantAccount.password) {
                      delete merchantAccount.password;
                    }
                    order.merchantAccount = merchantAccount;
                  }
                } else {
                  console.log('Order has no merchant: ' + order._id);
                }

                if (order.driverId) {
                  const driver = accounts.find((a: IAccount) => a._id.toString() === order.driverId.toString());
                  if (driver) {
                    if (driver.password) {
                      delete driver.password;
                    }
                    order.driver = driver;
                  }
                } else {
                  // console.log('Order without driver id:' + order._id.toString());
                }

                if (order.items) {
                  order.items.map((it: IOrderItem) => {
                    const product = ps.find((p: any) => p && p._id.toString() === it.productId.toString());
                    if (product) {
                      items.push({ productId: it.productId, quantity: it.quantity, price: it.price, cost: it.cost, product: product });
                    }
                  });
                  order.items = items;
                }
              });

              resolve(rs);
            });
          });
        });
      });
    });
  }



  // pickup --- string '11:20'
  getPickupDateTime(pickup: string) {
    const h = +(pickup.split(':')[0]);
    const m = +(pickup.split(':')[1]);
    return moment().set({ hour: h, minute: m, second: 0, millisecond: 0 }).toISOString();
  }

  quickFind(req: Request, res: Response) {
    let query: any = {};
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    if (query.hasOwnProperty('pickup')) {
      query.delivered = this.getPickupDateTime(query['pickup']);
      delete query.pickup;
    }

    this.find(query).then((x: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(x, null, 3));
    });
  }

  // admin modify order
  create(req: Request, res: Response) {
    const order = req.body;
    this.placeOrders([order]).then(savedOrder => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(savedOrder, null, 3));
    });
  }

  // local --- local date time string '2019-11-03T11:20:00.000Z', local.isUTC() must be false.
  // sLocalTime     --- local hour and minute eg. '11:20'
  // return --- utc date time
  setLocalTime(localDateTime: moment.Moment, sLocalTime: string): moment.Moment {
    const hour = +(sLocalTime.split(':')[0]);   // local hour
    const minute = +(sLocalTime.split(':')[1]); // local minute
    return localDateTime.set({ hour: hour, minute: minute, second: 0, millisecond: 0 });
  }

  // sUTC --- utc date time string
  toLocalDateTimeString(sUTC: string) {
    return moment(sUTC).local().format('YYYY-MM-DDTHH:mm:ss') + '.000Z';
  }


  createMobilePlanOrders() {
    // const self = this;
    // this.cellApplicationModel.joinFind({ status: CellApplicationStatus.STARTED }).then((cas: ICellApplication[]) => {
    //   const accountIds: any[] = [];
    //   cas.map((ca: ICellApplication) => {
    //     accountIds.push(ca.accountId);
    //     const items: IOrderItem[] = [{
    //       productId: ca.productId.toString(),
    //       productName: ca.product.name,
    //       quantity: 1,
    //       price: ca.product.price,
    //       cost: ca.product.cost
    //     }];

    //     // orders.push(order);
    //     setTimeout(() => {
    //       const account: any = ca.account;
    //       const merchant: any = ca.merchant;

    //       const order: IOrder = {
    //         clientId: ca.accountId.toString(),
    //         clientName: account ? account.username : 'N/A',
    //         merchantId: ca.product.merchantId.toString(),
    //         merchantName: merchant ? merchant.name : 'N/A',
    //         items: items,
    //         price: Math.round(+ca.product.price * 100) / 100,
    //         cost: Math.round(+ca.product.cost * 100) / 100,
    //         address: ca.address,
    //         location: {
    //           streetNumber: '30', streetName: 'Fulton Way', city: 'Toronto', province: 'ON', country: 'CA', postalCode: '',
    //           subLocality: 'RichmondHill', placeId: 'ChIJlQu-m1fTKogRNj4OtKn7yD0', lat: 43.983012, lng: -79.3906583
    //         }, // fix me!!!
    //         note: 'Mobile Plan Monthly Fee',
    //         deliveryCost: Math.round(0 * 100) / 100,
    //         deliveryDiscount: Math.round(0 * 100) / 100,
    //         groupDiscount: Math.round(0 * 100) / 100,
    //         overRangeCharge: Math.round(0 * 100) / 100,
    //         total: Math.round(+ca.product.price * 1.13 * 100) / 100,
    //         tax: Math.round(+ca.product.price * 0.13 * 100) / 100,
    //         tips: Math.round(0 * 100) / 100,
    //         type: OrderType.MOBILE_PLAN_MONTHLY,
    //         status: OrderStatus.NEW,
    //         paymentMethod: 'recurring prepay'
    //       };

    //       self.doInsertOne(order).then(() => {

    //       });
    //     }, 500);
    //   });
    // });
  }


  // should not directly call this function, use placeOrders instead.
  async doInsertOneV2(order: IOrder) {
    const location: ILocation = order.location;
    const date = order.deliverDate + 'T' + order.deliverTime + ':00.000Z';
    const time: any = order.deliverTime;
    const delivered = order.deliverDate + 'T15:00:00.000Z'; // this.getUtcTime(date, time).toISOString(); //tmp fix!!!

    if (order.code) {
      order.created = moment.utc().toISOString();
      order.delivered = delivered;
      const savedOrder = await this.insertOne(order)
      await this.accountModel.updateOne({ _id: order.clientId }, { type: 'client' });
      return savedOrder;
    } else {
      const sequence = await this.sequenceModel.reqSequence();
      order.code = this.sequenceModel.getCode(location, sequence);
      order.created = moment().toISOString();
      order.delivered = delivered;
      const savedOrder = await this.insertOne(order);
      await this.accountModel.updateOne({ _id: order.clientId }, { type: 'client' });
      return savedOrder;
    }
  }

  reqPlaceOrders(req: Request, res: Response) {
    const orders = req.body;
    this.placeOrders(orders).then((savedOrders: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(savedOrders, null, 3));
    });
  }

  // v2
  // create order batch Id
  async placeOrders(orders: IOrder[]) {
    const savedOrders: IOrder[] = [];
    const paymentId = (new ObjectID()).toString();
    if (orders && orders.length > 0) {
      for (let i = 0; i < orders.length; i++) {
        orders[i].paymentId = paymentId;
        const order: IOrder = orders[i];

        const savedOrder: IOrder = await this.doInsertOneV2(order);
        savedOrders.push(savedOrder);
      }
      const paymentMethod = orders[0].paymentMethod;
      if (paymentMethod === PaymentMethod.CASH || paymentMethod === PaymentMethod.PREPAY) {
        await this.addDebitTransactions(savedOrders);
      } else {
        // bank card and wechat pay will process transaction after payment gateway paid
      }
    }
    return savedOrders;
  }



  async doRemoveOne(orderId: string) {
    // return new Promise((resolve, reject) => {
    const docs = await this.find({ _id: orderId });
    if (docs && docs.length > 0) {
      const order = docs[0];
      const x = await this.updateOne({ _id: orderId }, { status: OrderStatus.DELETED });
      // temporary order didn't update transaction until paid
      if (order.status === OrderStatus.TEMP) {
        return order;
      } else {
        const merchantId: string = order.merchantId.toString();
        const merchantName = order.merchantName;
        const clientId: string = order.clientId.toString();
        const clientName = order.clientName;
        const cost = order.cost;
        const total = order.total;
        const delivered = order.delivered;

        const ps = await this.productModel.find({});
        const items: IOrderItem[] = [];
        order.items.map((it: IOrderItem) => {
          const product = ps.find((p: any) => p && p._id.toString() === it.productId.toString());
          if (product) {
            items.push({ productId: it.productId, quantity: it.quantity, price: it.price, cost: it.cost, product: product });
          }
        });

        const merchant = await this.merchantModel.findOne({ _id: merchantId });
        await this.transactionModel.updateMany({ orderId: orderId }, { status: 'del' });// This will affect balance calc
        const merchantAccountId = merchant.accountId.toString();
        await this.transactionModel.saveTransactionsForRemoveOrder(orderId, merchantAccountId, merchantName, clientId, clientName, cost, total, delivered, items);
        return order;
      }
    } else { // should never be here
      return;
    }
  }

  removeOrder(req: Request, res: Response) {
    const orderId = req.params.id;
    this.doRemoveOne(orderId).then(x => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(x, null, 3));
    });
  }

  // obsoleted
  createV1(req: Request, res: Response) {
    if (req.body instanceof Array) {
      this.insertMany(req.body).then((x: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(x, null, 3));
      });
    } else {
      this.insertOne(req.body).then((ret: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(ret, null, 3));
      });
    }
  }

  // deprecated
  replace(req: Request, res: Response) {
    this.replaceById(req.body.id, req.body).then((x: any) => {
      res.setHeader('Content-Type', 'application/json');
      // io.emit('updateOrders', x);
      res.send(JSON.stringify(x, null, 3));
    });
  }

  // deprecated
  getDistinctArray(items: any, field: string) {
    const a: any[] = [];
    items.map((item: any) => {
      if (item.hasOwnProperty(field)) {
        const b = a.find(x => x[field] === item[field]);
        if (!b) {
          a.push(item);
        }
      }
    });
    return a;
  }


  //-------------------------------------------------------
  // admin API
  // pickup  (string) --- eg. '11:20', '12:00'
  // deliver (string) --- eg. '12:00'
  updateDeliveryTime(req: Request, res: Response) {
    const pickup: string = req.body.pickup;
    const deliver: string = req.body.deliver;
    const order: IOrder = req.body.order;
    const orderId = order._id;
    const oldDelivered: any = order.delivered;
    const delivered: string = this.getUtcTime(oldDelivered, deliver).toISOString();

    this.updateOne({ _id: orderId }, { delivered, pickup, deliver }).then((result) => {
      this.findOne({ _id: orderId }).then((order: IOrder) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(order, null, 3));
      });
    });
  }

  saveTransactionsForPlaceOrder(orders: any[], merchant: any) {
    let promises = [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      promises.push(
        this.transactionModel.saveTransactionsForPlaceOrder(
          order._id.toString(),
          order.type,
          merchant.accountId.toString(),
          merchant.name,
          order.clientId.toString(),
          order.clientName,
          order.cost,
          order.total,
          order.delivered
        )
      );
    }
    return Promise.all(promises);
  }

  // add transactions for placing order for duocun and merchant
  async addDebitTransactions(orders: IOrder[]) {
    if (orders && orders.length > 0) {
      const merchantId = orders[0].merchantId.toString();
      const merchant = await this.merchantModel.findOne({ _id: merchantId });
      await this.saveTransactionsForPlaceOrder(orders, merchant);
      return;
    } else {
      return;
    }
  }

  // add transaction to Bank and update the balance
  async addCreditTransaction(paymentId: string, clientId: string, clientName: string, amount: number, actionCode: string, delivered: string) {
    const tr: ITransaction = {
      fromId: clientId,
      fromName: clientName,
      toId: BANK_ID,
      toName: BANK_NAME,
      amount,
      actionCode,
      paymentId,
      delivered
    };

    const t = await this.transactionModel.doInsertOne(tr);
    return t;
  }


  // paymentId --- order paymentId
  async processAfterPay(paymentId: string, actionCode: string, amount: number, chargeId: string) {
    const orders = await this.find({ paymentId });
    if (orders && orders.length > 0) {
      const order = orders[0];
      if (order.paymentStatus === PaymentStatus.UNPAID) {
        // add two transactions for placing order for duocun and merchant
        await this.addDebitTransactions(orders);

        // add transaction to Bank and update the balance
        const delivered: any = order.delivered;
        const clientId = order.clientId.toString();
        await this.addCreditTransaction(paymentId, clientId, order.clientName, amount, actionCode, delivered); // .then(t => {

        // update payment status to 'paid' for the orders in batch
        const data = { status: OrderStatus.NEW, paymentStatus: PaymentStatus.PAID };
        const updates = orders.map(order => ({ query: { _id: order._id }, data }));
        await this.bulkUpdate(updates);
        return;
      }
    } else { // add credit for Wechat
      const credit = await this.clientCreditModel.findOne({ paymentId }); // .then((credit) => {
      if (credit) {
        if (credit.status === PaymentStatus.UNPAID) {
          await this.clientCreditModel.updateOne({ _id: credit._id }, { status: PaymentStatus.PAID }); // .then(() => {
          const accountId = credit.accountId.toString();
          const accountName = credit.accountName;
          const note = credit.note;
          const paymentMethod = credit.paymentMethod;
          await this.transactionModel.doAddCredit(accountId, accountName, amount, paymentMethod, note); // .then(() => {
          return;
        } else {
          return;
        }
      } else {
        return;
      }
    }
  }

  //-----------------------------------------------------------------------------------------
  // change order status to 'paid', insert a new transaction and update corresponding balance
  pay(toId: string, toName: string, received: number, orderId: string, note?: string) {
    const data = {
      paymentStatus: PaymentStatus.PAID,
      driverId: toId,
      driverName: toName
    };

    return new Promise((resolve, reject) => {
      this.updateOne({ _id: orderId }, data).then(rt => {
        this.findOne({ _id: orderId }).then(order => {

          const tr = {
            orderId: order ? order._id.toString() : '', // fix me
            fromId: order.clientId.toString(),
            fromName: order.clientName,
            toId: toId,
            toName: toName,
            type: 'credit',
            actionCode: TransactionAction.PAY_DRIVER_CASH.code, // 'client pay cash',
            amount: received,
            note: note
          };

          this.transactionModel.doInsertOne(tr).then(t => {
            resolve(order);
          });

        });
      });
    });
  }


  // driver side api
  // pay order and update assignment to status 'done'
  payOrder(req: Request, res: Response) {
    const toId = req.body.toId;
    const toName = req.body.toName;
    const received = +req.body.received;
    const orderId = req.body.orderId;
    const note = req.body.note;

    this.pay(toId, toName, received, orderId, note).then((order: any) => {
      // this.assignmentModel.updateOne({ 'orderId': orderId }, { status: 'done' }).then(() => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({ status: 'success' }, null, 3));
      // });
    });
  }

  groupBySameDay(items: any[], key: string) {
    const groups: any = {};
    items.map(it => {
      const date = moment(it[key]).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
      const dt = Object.keys(groups).find(x => moment(x).isSame(date, 'day'));

      if (dt) {
        groups[dt].push(it);
      } else {
        groups[date.toISOString()] = [it];
      }
    });

    return groups;
  }

  getOrderTrends(req: Request, res: Response) {
    const query = {
      // delivered: { $gt: moment('2019-06-01').toDate() },
      status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] }
    };

    this.find(query).then(orders => {
      const group = this.groupBySameDay(orders, 'delivered');
      const keys = Object.keys(group);
      const vals: any[] = [];
      keys.map(key => {
        vals.push(group[key] ? group[key].length : 0);
      });

      // this.barChartLabels = keys;
      // this.barChartData = [{ data: vals, label: '订单数' }];

      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({ keys: keys, vals: vals }, null, 3));
    });
  }

  // date --- '2019-11-15'
  getSummary(type: string, date: string) {
    const dt = moment(date);
    const range = { $gt: dt.startOf('day').toISOString(), $lt: dt.endOf('day').toISOString() };
    const q = { type: type, delivered: range, status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] } };
    this.joinFind(q).then((orders: IOrder[]) => {
      const orderIds: string[] = [];
      orders.map(order => {
        const orderId: any = order._id;
        order.code = order.code ? order.code : 'N/A';
        orderIds.push(orderId.toString());
      });

      const tQuery = { orderId: { $in: orderIds }, actionCode: TransactionAction.PAY_DRIVER_CASH.code };// 'client pay cash' };
      this.transactionModel.find(tQuery).then((ts: ITransaction[]) => {

      });
    });
  }

  // groupBy(items, key) {
  //   return items.reduce((result, item) => ({
  //     ...result,
  //     [item[key]]: [
  //       ...(result[item[key]] || []),
  //       item,
  //     ],
  //   }), {});
  // }
  reqClients(req: Request, res: Response) {
    this.getClients().then(rs => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(rs, null, 3));
    });
  }

  getClients() {
    const qOrder = {
      type: OrderType.FOOD_DELIVERY,
      status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] }
    };
    return new Promise((resolve, reject) => {
      this.find(qOrder).then((orders: IOrder[]) => {
        this.accountModel.find({}).then((clients: IAccount[]) => {
          const groups = this.groupBy(orders, 'clientId');
          const cs: IAccount[] = [];
          Object.keys(groups).map(cId => {
            const group = groups[cId];
            if (group && group.length > 0) {
              const order = group[0];
              const client = clients.find((c: any) => c._id.toString() === order.clientId.toString());
              if (client) {
                cs.push(client);
              }
            }
          });
          resolve(cs);
        });
      });
    });
  }

  // to be added --- should add sort type
  sortByDeliverDate(orders: any[]) {
    return orders.sort((a: IOrder, b: IOrder) => {
      const ma = moment(a.delivered);
      const mb = moment(b.delivered);
      if (ma.isAfter(mb)) {
        return -1;
      } else if (mb.isAfter(ma)) {
        return 1;
      } else {
        const ca = moment(a.created);
        const cb = moment(b.created);
        if (ca.isAfter(cb)) {
          return -1;
        } else {
          return 1;
        }
      }
    });
  }

  getDescription(order: any, lang: string) {
    const d = order.delivered.split('T')[0];
    // const y = +(d.split('-')[0]);
    const m = +(d.split('-')[1]);
    const prevMonth = m === 1 ? 12 : (m - 1);

    // const product = order.items[0].product;
    // const productName = lang === 'en' ? product.name : product.nameEN;
    const range = prevMonth + '/27 ~ ' + m + '/26';

    if (order.type === 'MM') {
      return range + (lang === 'en' ? ' Phone monthly fee' : ' 电话月费');
      // } else if (order.type === 'MS') {
      //   return (this.lang === 'en' ? ' Phone setup fee' : ' 电话安装费');
    } else {
      return '';
    }
  }

  // return [{_id, address description,items, merchantName, clientPhoneNumber, price, total, tax, delivered, created}, ...]
  async loadHistory(clientId: string, itemsPerPage: number, currentPageNumber: number) {
    const client = await this.accountModel.findOne({ _id: clientId });
    const ps = await this.productModel.find({});
    const query = { clientId, status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] } };
    const rs = await this.find(query);

    const arrSorted = this.sortByDeliverDate(rs);
    const start = (currentPageNumber - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const arr = arrSorted.slice(start, end);

    return arr.map((order: any) => {
      const items: any[] = [];
      order.items.map((it: any) => {
        const product = ps.find((p: any) => p._id.toString() === it.productId.toString());
        if (product) {
          items.push({ product, quantity: it.quantity, price: it.price });
        }
      });

      const description = this.getDescription(order, 'zh');
      const clientPhoneNumber = client.phone;
      const address = this.locationModel.getAddrString(order.location);
      return { ...order, address, description, items, clientPhoneNumber };
    });
  }

  async loadPage(query: any, itemsPerPage: number, currentPageNumber: number) {
    if (query.hasOwnProperty('pickup')) {
      query.delivered = this.getPickupDateTime(query['pickup']);
      delete query.pickup;
    }
    const accounts = await this.accountModel.find({});
    const ms = await this.merchantModel.find({});
    const ps = await this.productModel.find({});
    const rs = await this.find(query);

    const arrSorted = this.sortByDeliverDate(rs);
    const start = (currentPageNumber - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const len = arrSorted.length;
    const arr = arrSorted.slice(start, end);

    return arr.map((order: any) => {
      const items: any[] = [];
      order.client = accounts.find((a: any) => a._id.toString() === order.clientId.toString());
      order.merchant = ms.find((m: any) => m._id.toString() === order.merchantId.toString());
      order.merchantAccount = accounts.find((a: any) => a && order.merchant && a._id.toString() === order.merchant._id.toString());

      order.items.map((it: any) => {
        const product = ps.find((p: any) => p._id.toString() === it.productId.toString());
        if (product) {
          items.push({ product: product, quantity: it.quantity, price: it.price, cost: it.cost });
        }
      });
      order.items = items;
    });
  }

  reqLatestViewed(req: Request, res: Response) {
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    let fields: string[];
    if (req.headers && req.headers.fields && typeof req.headers.fields === 'string') {
      fields = (req.headers && req.headers.fields) ? JSON.parse(req.headers.fields) : null;
    }

    res.setHeader('Content-Type', 'application/json');
    if (query) {
      this.getLatestViewed(query.delivered).then((rs: any[]) => {
        const xs = this.filterArray(rs, fields);
        res.send(JSON.stringify(xs, null, 3));
      });
    } else {
      res.send(JSON.stringify([], null, 3));
    }
  }

  // get all the orders that Merchant Viewed
  getLatestViewed(delivered: string): Promise<any[]> {
    const range = { $gte: moment(delivered).startOf('day').toISOString(), $lte: moment(delivered).endOf('day').toISOString() };
    const query: any = {
      delivered: range,
      type: OrderType.FOOD_DELIVERY,
      status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] }
    };

    return new Promise((resolve, reject) => {
      this.find(query).then((orders: any) => {
        this.logModel.getLatestByAccount(Action.VIEW_ORDER, AccountType.MERCHANT, delivered).then((logs: any[]) => {
          let rs: any[] = [];
          if (logs && logs.length > 0) {
            const accountIds: string[] = [];
            logs.map((log: any) => { // each log has only one merchant
              const merchantAccountId = log.merchantAccountId ? log.merchantAccountId.toString() : null;
              if (merchantAccountId) {
                accountIds.push(merchantAccountId);
              }
            });

            this.accountModel.find({ _id: { $in: accountIds } }).then(accounts => {
              if (accounts && accounts.length > 0) {
                accounts.map((a: IAccount) => {
                  const log = logs.find(l => l.merchantAccountId.toString() === a._id.toString());
                  const dt = moment(log.created);
                  const merchants: any = a.merchants;
                  if (merchants && merchants.length > 0) {
                    const its = orders.filter((order: IOrder) => merchants.indexOf(order.merchantId.toString()) !== -1
                      && moment(order.modified).isSameOrBefore(dt));

                    if (its && its.length > 0) {
                      rs = rs.concat(its);
                    }
                  }
                });
              }
              resolve(rs);
            });
          } else {
            resolve([]);
          }
        });
      });
    });
  }
  // tools

  reqStatisticsByClient(req: Request, res: Response) {
    this.getStatisticsByClient().then(rs => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(rs, null, 3));
    });
  }

  groupByClientId(items: IOrder[]) {
    const groups: any = {};
    items.map(it => {
      if (it.clientId) {
        const clientId = it.clientId.toString();
        const found = Object.keys(groups).find(cId => cId.toString() === clientId);

        if (found) {
          groups[clientId].push(it);
        } else {
          groups[clientId] = [it];
        }
      } else {
        console.log('Bad order: ' + it._id);
      }
    });

    return groups;
  }

  getStatisticsByClient() {
    const query = {
      status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED, OrderStatus.TEMP] }
    };

    return new Promise((resolve, reject) => {
      this.accountModel.find({}).then(accounts => {
        this.find(query).then(orders => {
          const groups = this.groupByClientId(orders);
          const rs: any[] = [];
          Object.keys(groups).map(key => {
            const group = groups[key];
            if (group && group.length > 0) {
              const order = group[0];
              if (order.clientId) {
                const client = accounts.find((a: any) => a._id.toString() === order.clientId.toString());
                if (client) {
                  if (client.password) {
                    delete client.password;
                  }
                  order.client = client;
                }
              } else {
                console.log(order._id);
              }
              const date = this.getFirstAndLastDeliverDate(group);
              if (date) {
                const phone = order.client ? order.client.phone : 'N/A';
                rs.push({
                  clientId: key, clientName: order.clientName, clientPhoneNum: phone,
                  nOrders: group.length, firstOrdered: date.first, lastOrdered: date.last,
                  frequency: Math.round(group.length / date.nDays * 100) / 100
                });
              }
            }
          });

          const ret = rs.sort((a: any, b: any) => {
            if (a.lastOrdered) {
              if (moment(a.lastOrdered).isSameOrAfter(moment(b.lastOrdered))) {
                return 1;
              } else {
                return -1;
              }
            } else {
              return -1;
            }
          });

          resolve(ret);
        });
      });
    });
  }

  getFirstAndLastDeliverDate(orders: IOrder[]) {
    if (orders && orders.length > 0) {
      let last = moment('2019-01-01T00:00:00.000Z');
      let first = moment();
      orders.map(order => {
        const dt = moment(order.delivered);
        if (dt.isSameOrAfter(last)) {
          last = dt;
        }
        if (dt.isSameOrBefore(first)) {
          first = dt;
        }
      });
      return { first: first, last: last, nDays: last.diff(first, 'days') + 1 };
    } else {
      return null;
    }
  }

  updatePurchaseTag(req: Request, res: Response) {
    this.accountModel.find({ type: { $nin: ['system', 'merchant', 'driver'] } }).then(accounts => {
      this.distinct('clientId', { status: { $nin: [OrderStatus.DELETED, OrderStatus.TEMP] } }).then((clientIds: any[]) => {
        const datas: any[] = [];
        clientIds.map(clientId => {
          const account = accounts.find((a: any) => a._id.toString() === clientId.toString());
          if (account) {
            datas.push({
              query: { _id: clientId },
              data: { type: 'client' }
            });
          }
        });

        this.accountModel.bulkUpdate(datas).then(() => {
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify('success', null, 3));
        });
      });
    });
    // this.accountModel.find({roles: 5}).then(accounts => {
    //   const datas: any[] = [];
    //   accounts.map((account: any) => {
    //     datas.push({
    //       query: { _id: account._id },
    //       data: { type: 'driver' }
    //     });
    //   });

    //   this.accountModel.bulkUpdate(datas).then(() => {
    //     res.setHeader('Content-Type', 'application/json');
    //     res.send(JSON.stringify('success', null, 3));
    //   });
    // });
  }

  fixCancelledTransaction(req: Request, res: Response) {
    const q = {
      actionCode: TransactionAction.CANCEL_ORDER_FROM_MERCHANT, //'duocun cancel order from merchant',
      orderId: { $exists: true }
    };

    this.transactionModel.find(q).then(ts => {
      const datas: any[] = [];
      const oIds: string[] = [];

      ts.map((t: ITransaction) => {
        if (t.orderId) {
          oIds.push(t.orderId);
        }
      });

      this.joinFind({ _id: { $in: oIds } }).then((orders: any[]) => {
        ts.map((t: ITransaction) => {
          const transOrderId: any = t.orderId;
          const order = orders.find(ord => ord._id.toString() === transOrderId.toString());
          if (order) {
            const items: any[] = [];
            order.items.map((it: IOrderItem) => {
              const product: any = it.product;
              items.push({ productId: it.productId, quantity: it.quantity, price: it.price, cost: it.cost, product: product });
            });

            datas.push({
              query: { _id: t._id },
              data: { items: items }
            });
          }
        });

        this.transactionModel.bulkUpdate(datas).then(() => {
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify('success', null, 3));
        });
      });
    });
  }


  getItemString(order: any) {
    const items: any[] = order.items;
    let s = '';
    items.map(it => {
      const product: any = it.product;
      s += product.name + ' x' + it.quantity + ' ';
    });
    return s;
  }

  getAttributesString(client: any) {
    if (client) {
      return client.attributes ? client.attributes.join(' ') : 'N/A';
    } else {
      return 'N/A';
    }
  }

  reqCSV(req: Request, res: Response) {
    const path = '../order.csv';

    const cw = createObjectCsvWriter({
      path: path,
      header: [
        { id: 'code', title: 'code' },
        { id: 'client', title: 'client' },
        { id: 'clientPhone', title: 'client phone' },
        { id: 'clientAttr', title: 'client Attribute' },
        { id: 'merchant', title: 'merchant' },
        { id: 'items', title: 'items' },
        { id: 'price', title: 'price' },
        { id: 'cost', title: 'cost' },
        { id: 'address', title: 'address' },
        { id: 'note', title: 'note' },
        { id: 'deliveryCost', title: 'deliveryCost' },
        { id: 'groupDiscount', title: 'groupDiscount' },
        { id: 'overRangeCharge', title: 'overRangeCharge' },
        { id: 'total', title: 'total' },
        { id: 'tax', title: 'tax' },
        { id: 'type', title: 'type' },
        { id: 'status', title: 'status' },
        { id: 'paymentStatus', title: 'paymentStatus' },
        { id: 'paymentMethod', title: 'paymentMethod' },
        { id: 'delivered', title: 'delivered' },
        { id: 'created', title: 'created' },
        // {id: 'modified', title: 'modified'},
      ]
    });
    const data: any[] = [];
    this.joinFind({}).then((orders: IOrder[]) => {
      orders.map(order => {
        // const s = ApplicationStatus.find(a => a.code === ca.status);
        // const c = carriers.find(c => c.code === ca.carrier);
        const client: any = order.client;
        data.push({
          code: order.code,
          client: order.clientName,
          clientPhone: order.client ? order.client.phone : 'N/A',
          clientAttr: this.getAttributesString(client),
          merchant: order.merchantName,
          items: this.getItemString(order),
          price: order.price,
          cost: order.cost,
          address: order.address,
          note: order.note,
          deliveryCost: order.deliveryCost,
          groupDiscount: order.groupDiscount,
          overRangeCharge: order.overRangeCharge,
          total: order.total,
          tax: order.tax,
          type: order.type,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          delivered: order.delivered,
          created: order.created,
          // modified: order.modified
        });
      });

      cw.writeRecords(data).then(() => {
        res.download(path);
        console.log('The CSV file was written successfully');
      });
    });
  }

  checkStripePay(req: Request, res: Response) {
    const results: any[] = [];
    const parser = require('csv-parser');
    const fd = fs.createReadStream('/Users/zlk/works/stripepay.csv').pipe(parser())
      .on('data', (data: any) => results.push(data))
      .on('end', () => {
        console.log(results);
        // fd.close();
        const paymentMap: any = {};
        results.map(r => {
          const paymentId = r['paymentId']
          paymentMap[paymentId] = { paymentId, amount: +r['Amount'], created: r['Created'], orders: [], client: '', total: 0 };
        });

        const fields = ['_id', 'clientName', 'total', 'delivered'];
        const s = '2020-04-01:00:00:00.000Z';
        const e = '2020-04-06:00:00:00.000Z';
        const start = moment.utc(s).startOf('day').toISOString();
        const end = moment.utc(e).endOf('day').toISOString();
        const qOrder = { created: { $gte: start, $lte: end }, paymentMethod: PaymentMethod.CREDIT_CARD };// paymentStatus: PaymentStatus.PAID
        this.find(qOrder, fields).then(orders => {
          orders.map((order: any) => {
            const paymentId = order.paymentId.toString();
            const payment = paymentMap[paymentId];
            if (payment) {
              paymentMap[paymentId].total += order.total;
              paymentMap[paymentId].orders.push(order);
              paymentMap[paymentId].client = order.clientName;
              const dt = paymentMap[paymentId].created.split(' ');
              paymentMap[paymentId].date = dt[0].trim();
              paymentMap[paymentId].time = dt[1].split('.')[0].trim();
            } else {
              console.log(paymentId);
            }
          });

          // check
          const ps: any[] = [];
          Object.keys(paymentMap).map(paymentId => {
            const p = paymentMap[paymentId];
            if (p.total === p.amount && p.total !== 0) {
              p.status = 'valid';
            } else {
              p.status = 'invalid';
            }
            ps.push(p);
          });
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(JSON.stringify(ps), null, 3));
        });
        // [
        //   { NAME: 'Daffy Duck', AGE: '24' },
        //   { NAME: 'Bugs Bunny', AGE: '22' }
        // ]

      });
  }

  async reverseTransactions() {
    const orders = await this.find({ deliverDate: '2021-04-07' });
    const orderIds = orders.map(order => order._id.toString());
    const trMap: any = {};
    orders.map(order => {
      trMap[order._id.toString()] = { nTrs: 0, order };
    })
    const actionCode = 'OFM';
    const ts = await this.transactionModel.find({ orderId: { $in: orderIds }, actionCode });
    ts.map(t => {
      trMap[t.orderId.toString()].nTrs++;
    });

    const ids = Object.keys(trMap).filter(orderId => trMap[orderId].nTrs === 0);
    return ids.map(oid => trMap[oid].order);
    // const ws: any[] = await this.loadWechatPayments();
    // const trMap: any = {};
    // ws.map((w: any) => {
    //   const paymentId = w.paymentId;
    //   const amount = w.amount;
    //   trMap[paymentId] = { paymentId, amount };
    // });
    // const rs = orders.map(r => {
    //   return {
    //     paymentId: r.paymentId.toString(),
    //     clientId: r.clientId,
    //     clientName: r.clientName,
    //     amount: trMap[r.paymentId.toString()].amount,
    //     actionCode,
    //     delivered: r.delivered
    //   };
    // });

    // await this.transactionModel.deleteMany({ _id: { $in: tIds } });
    // await this.addCreditTransactions(rs);
    // return orders;

    // saveTransactionsForPlaceOrder(orders: any[], merchant: any) 
  }


  async findMissingPaid(actionCode: any) {

    const trs: any[] = await this.transactionModel.find({ actionCode });
    const ws: any[] = await this.loadWechatPayments(); // this.loadCCPayments(); // 

    const trMap: any = {};
    trs.map((tr: any) => {
      const paymentId = tr.paymentId ? tr.paymentId.toString() : 'x';
      const clientName = tr.fromName;
      const clientId = tr.fromId;
      const delivered = tr.delivered;
      trMap[paymentId] = { paymentId, amount: 0, delivered, nTrs: 0, transactions: [], clientName, clientId, nOrders: 0, orders: [] };
    });
    ws.map((w: any) => {
      const paymentId = w.paymentId;
      const amount = w.amount;
      const data = trMap[paymentId];
      trMap[paymentId] = { ...data, paymentId, amount, actionCode, nWs: 0, ws: [], created: w.createdDate, description: w.Description };
    });

    // process
    trs.map((tr: any) => {
      const paymentId = tr.paymentId ? tr.paymentId.toString() : 'x';
      trMap[paymentId].nTrs++;
      trMap[paymentId].transactions.push(tr);
      trMap[paymentId].created = tr.created.split('.')[0];
    });

    ws.map((w: any) => {
      const paymentId = w.paymentId;
      trMap[paymentId].nWs++;
      trMap[paymentId].ws.push(w);
      trMap[paymentId].created = w.created.split('.')[0];
    });

    const vals = Object.keys(trMap).map(pId => trMap[pId]);
    const rs = vals.filter(t => t.nTrs < t.nWs && t.paymentId !== 'x');
    // const pIds = rs.map(r => r.paymentId);

    // const orders: any[] = await this.find({ paymentId: { $in: pIds } }); // joinFind Not working

    // orders.map(order => {
    //   const paymentId = order.paymentId.toString();
    //   trMap[paymentId].nOrders++;
    //   trMap[paymentId].orders.push(order);
    //   trMap[paymentId].cId = order.clientId.toString()
    // });
    // const vals2 = Object.keys(trMap).map(pId => trMap[pId]);
    // const rs2 = vals2.filter(t => t.nTrs < t.nWs && t.paymentId !== 'x');

    // fixing ...
    // await this.addCreditTransactions(rs);
    // const data = { status: OrderStatus.NEW, paymentStatus: PaymentStatus.PAID, deliverDate: '2021-04-07' };
    // await this.updateOrdersAsPaid(orders, data);


    // const clientIds: any[] = [];
    // rs2.map(r => {
    //   if (r.nTrs > 1) {
    //     clientIds.push(r.cId);
    //   }
    // });
    // return clientIds;
    return rs;
  }

  // rs --- [{paymentId, orders[]}]
  // addCreditTransactions(rs: any[]) {
  //   let promises = [];
  //   for (let i = 0; i < rs.length; i++) {
  //     const r = rs[i];
  //     promises.push(
  //       this.addCreditTransaction(
  //         r.paymentId,
  //         r.clientId,
  //         r.clientName,
  //         r.amount,
  //         r.actionCode,
  //         r.delivered
  //       )
  //     );
  //   }
  //   return Promise.all(promises);
  // }

  async findMissingUnpaid() {
    const actionCode = TransactionAction.PAY_BY_CARD.code;
    const trs: any[] = await this.transactionModel.find({ actionCode });
    const ws: any[] = await this.loadCCPayments();
    // const ws: any[] = await this.loadWechatPayments();

    const trMap: any = {};
    trs.map((tr: any) => {
      const paymentId = tr.paymentId ? tr.paymentId.toString() : 'x';
      trMap[paymentId] = { paymentId, nTrs: 0, transactions: [], nWs: 0, ws: [], created: '', client: '' };
    });
    ws.map((w: any) => {
      const paymentId = w.paymentId;
      trMap[paymentId] = { paymentId, nTrs: 0, transactions: [], nWs: 0, ws: [], created: '', client: '' };
    });

    // process
    trs.map((tr: any) => {
      const paymentId = tr.paymentId ? tr.paymentId.toString() : 'x';
      trMap[paymentId].nTrs++;
      trMap[paymentId].transactions.push(tr);
      trMap[paymentId].created = tr.created.split('.')[0];
      trMap[paymentId].client = tr.fromName;
    });

    ws.map((w: any) => {
      const paymentId = w.paymentId;
      trMap[paymentId].nWs++;
      trMap[paymentId].ws.push(w);
    });

    const vals = Object.keys(trMap).map(pId => trMap[pId]);
    const rs = vals.filter(t => t.nTrs > t.nWs && t.paymentId !== 'x');

    // fixing ...
    const clientIds: any[] = [];
    const trIds: any[] = [];
    rs.map(r => {
      if (r.nTrs > r.nWs) {
        for (let i = 0; i < r.transactions.length; i++) { // !!! index !!!!!
          trIds.push(r.transactions[i]._id);
        }
        clientIds.push(r.transactions[0].fromId.toString());
      }
    });
    await this.transactionModel.deleteMany({ _id: { $in: trIds } });

    return clientIds;
    // return rs;
  }

  loadWechatPayments(): Promise<any[]> {
    const results: any[] = [];
    const parser = require('csv-parser');
    return new Promise((resolve, reject) => {
      // fs.createReadStream('/Users/zlk/works/wechatpay.csv').pipe(parser())
      fs.createReadStream('/home/ubuntu/wechatpay.csv').pipe(parser())
        .on('data', (data: any) => results.push(data))
        .on('end', () => {
          const rs: any[] = results.map(r => {
            const paymentId = r['Merchant Order No.'];
            const amount = +r['Total Paid'];
            const createdDate = r['Created Time'].split(' ')[0];
            const created = (r['Created Time'] + '00Z').replace(/\s/, 'T');
            return { paymentId, amount, createdDate, created };
          });
          resolve(rs);
        });
    });
  }

  loadCCPayments(): Promise<any[]> {
    const results: any[] = [];
    const parser = require('csv-parser');
    return new Promise((resolve, reject) => {
      // fs.createReadStream('/Users/zlk/works/cc_payments.csv').pipe(parser())
      fs.createReadStream('/home/ubuntu/cc_payments.csv').pipe(parser())
        .on('data', (data: any) => results.push(data))
        .on('end', () => {
          const rs: any[] = results.map(r => {
            const paymentId = r['paymentId (metadata)'];
            const amount = +r['Amount'];
            const description = +r['Description'];
            const createdDate = r['Created (UTC)'].split(' ')[0];
            const created = (r['Created (UTC)'] + ':00.000Z').replace(/\s/, 'T');
            return { paymentId, amount, createdDate, created, description };
          });
          resolve(rs);
        });
    });
  }

  reqFixMissingPaid(req: Request, res: Response) {
    // const ps: any[] = [];
    const self = this;
    const actionCode: any = TransactionAction.PAY_BY_WECHAT.code;
    this.reverseTransactions().then((ps) => {
      this.merchantModel.find({}).then(merchants => {
        ps.map(order => {
          const merchant = merchants.find(m => m._id.toString() === order.merchantId.toString())
          self.transactionModel.saveTransactionsForPlaceOrder(
            order._id.toString(),
            order.type,
            merchant.accountId.toString(),
            merchant.name,
            order.clientId.toString(),
            order.clientName,
            order.cost,
            order.total,
            order.delivered
          )
        })
      });

      // rs.map(r => {
      //   setTimeout(() => {
      //     self.addCreditTransaction(
      //       r.paymentId.toString(),
      //       r.clientId.toString(),
      //       r.clientName,
      //       r.amount,
      //       r.actionCode,
      //       r.delivered
      //     ).then(() => {

      //     });
      //   }, 100);
      // });

      setTimeout(() => {
        const clientIds = ps.map((r: any) => r.clientId);
        self.transactionModel.find({}).then(ts => {
          clientIds.map((cId) => {
            self.transactionModel.updateBalanceByAccountId(cId, ts);
          });

          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(JSON.stringify(ps), null, 3));
        });
      }, 10000);
    });

    // this.findMissingPaid(actionCode).then((ps) => {
    //   const self = this;
    //   const clientIds = ps;
    //   this.transactionModel.find({}).then(ts => {
    //     clientIds.map((cId) => {
    //       setTimeout(() => {
    //         self.transactionModel.updateBalanceByAccountId(cId, ts);
    //       }, 1000);
    //     });
    //   });
    //   res.setHeader('Content-Type', 'application/json');
    //   res.send(JSON.stringify(JSON.stringify(ps), null, 3));
    // });
  }

  reqFixMissingUnpaid(req: Request, res: Response) {
    this.findMissingUnpaid().then((ps) => {
      const self = this;
      const clientIds = ps;
      this.transactionModel.find({}).then(ts => {
        clientIds.map((cId) => {
          setTimeout(() => {
            self.transactionModel.updateBalanceByAccountId(cId, ts);
          }, 1000);
        });
      });
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(JSON.stringify(ps), null, 3));
    });
  }

  async getUnregisteredWechatPay(wechats: any[]) {
    const paymentMap: any = {};
    const paymentIds: any[] = [];
    wechats.map(r => {
      const paymentId = r['Merchant Order No.'];
      const amount = +r['Total Paid'];
      const created = (r['Created Time'] + '00Z').replace(/\s/, 'T');
      paymentMap[paymentId] = { paymentId, amount, created, orders: [], client: '', total: 0 };
      paymentIds.push(paymentId);
    });

    const q = {
      paymentId: { $in: paymentIds },
      status: { $nin: [OrderStatus.BAD, OrderStatus.DELETED] },
      paymentStatus: PaymentStatus.UNPAID
    }; // , OrderStatus.TEMP
    const trs = await this.find(q);
    const pids = paymentIds.filter(pId => !trs.find((t: any) => t.paymentId.toString() === pId));

    const orderMap: any = {};
    trs.map(order => {
      pids.map(pid => {
        if (pid === order.paymentId.toString()) {
          orderMap[pid] = order;
        }
      });
    });
    const rs = pids.map(pid => paymentMap[pid]);

    return rs.map(r => {
      const order = orderMap[r.paymentId];
      const client = order ? order.clientName : 'N/A';
      return { ...r, status: 'invalid', date: r.created.split('T')[0], client }
    });
  }

  reqMissingWechatPayments(req: Request, res: Response) {
    const results: any[] = [];
    const parser = require('csv-parser');
    const fd = fs.createReadStream('/Users/zlk/works/wechatpay.csv').pipe(parser())
      .on('data', (data: any) => results.push(data))
      .on('end', () => {

        this.getUnregisteredWechatPay(results).then((ps) => {
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(JSON.stringify(ps), null, 3));
        });
      });
  }

  reqCorrectTime(req: Request, res: Response) {
    this.correctTime().then((ps) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(JSON.stringify(ps), null, 3));
    });
  }


  getWechatPayments() {

  }

  reqWechatPayments(req: Request, res: Response) {
    this.correctTime().then((ps) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(JSON.stringify(ps), null, 3));
    });
  }


  async correctTime() {
    const delivered = { $gte: moment('2020-04-07T00:00:00.000Z').startOf('day').toISOString() };
    const rs: any[] = await this.find({ delivered });
    const items: any[] = [];
    rs.map((order: any) => {
      const t = order.delivered.split('T')[1];
      const date = order.delivered.split('T')[0];
      if (date === '2020-04-19') {
        const data = { delivered: '2020-04-12T15:00:00.000Z' };
        items.push({ query: { _id: order._id }, data });
      } else {
        if (t !== '15:00:00.000Z') {
          const data = { delivered: date + 'T15:00:00.000Z' };
          items.push({ query: { _id: order._id }, data });
        }
      }
    });
    await this.bulkUpdate(items);
    return items.map(it => it.query._id);
  }


  checkWechatpay(req: Request, res: Response) {
    const results: any[] = [];
    const parser = require('csv-parser');
    const fd = fs.createReadStream('/Users/zlk/works/wechatpay.csv').pipe(parser())
      .on('data', (data: any) => results.push(data))
      .on('end', () => {
        console.log(results);
        // fd.close();
        const paymentMap: any = {};
        results.map(r => {
          const paymentId = r['Merchant Order No.']
          paymentMap[paymentId] = { paymentId, amount: +r['Total Paid'], created: r['Created Time'], orders: [], client: '', total: 0 };
        });

        const fields = ['_id', 'clientName', 'total', 'delivered'];
        const s = '2020-04-01:00:00:00.000Z';
        const e = '2020-04-06:00:00:00.000Z';
        const start = moment.utc(s).startOf('day').toISOString();
        const end = moment.utc(e).endOf('day').toISOString();
        const qOrder = { created: { $gte: start, $lte: end }, paymentMethod: PaymentMethod.WECHAT };// paymentStatus: PaymentStatus.PAID
        this.find(qOrder, fields).then(orders => {
          orders.map((order: any) => {
            const paymentId = order.paymentId.toString();
            const payment = paymentMap[paymentId];
            if (payment) {
              paymentMap[paymentId].total += order.total;
              paymentMap[paymentId].orders.push(order);
              paymentMap[paymentId].client = order.clientName;
              const dt = paymentMap[paymentId].created.split(' ');
              paymentMap[paymentId].date = dt[0].trim();
              paymentMap[paymentId].time = dt[1].split('.')[0].trim();
            } else {
              console.log(paymentId);
            }
          });

          // check
          const ps: any[] = [];
          Object.keys(paymentMap).map(paymentId => {
            const p = paymentMap[paymentId];
            if (p.total === p.amount && p.total !== 0) {
              p.status = 'valid';
            } else {
              p.status = 'invalid';
            }
            ps.push(p);
          });
          res.setHeader('Content-Type', 'application/json');
          res.send(JSON.stringify(JSON.stringify(ps), null, 3));
        });
        // [
        //   { NAME: 'Daffy Duck', AGE: '24' },
        //   { NAME: 'Bugs Bunny', AGE: '22' }
        // ]

      });
  }
}

