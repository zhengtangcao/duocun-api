import express from "express";
import { DB } from "../db";
import { Order, IOrder, PaymentMethod, OrderStatus } from "../models/order";
import { Request, Response } from "express";
import { Model, Code } from "../models/model";
import { Account } from "../models/account";
import { Product } from "../models/product";
import logger from "../lib/logger";
export function OrderRouter(db: DB) {
  const router = express.Router();
  const model = new Order(db);

  const controller = new OrderController(db);

  // yaml
  router.post('/bulk', (req, res) => { controller.placeOrders(req, res); });
  router.delete('/:id', (req, res) => { controller.removeOrder(req, res); });
  router.post('/validateCart', (req, res) => { controller.validateCart(req, res); });
  // v2
  router.get('/v2/transactions', (req, res) => { model.reqTransactions(req, res); });
  router.get('/v2/', (req, res) => { controller.listV2(req, res); });

  // Public
  // input:
  //  orders --- [ IOrders[] ], without _id and paymentId
  // return:
  //  orders ---- [IOrders[]],  new orders with _id and paymentId  
  router.post('/placeOrders', (req, res) => { model.reqPlaceOrders(req, res); });

  // tools
  // router.post('/missingWechatpayments', (req, res) => { model.reqMissingWechatPayments(req, res); });
  // router.post('/missingPaid', (req, res) => { model.reqFixMissingPaid(req, res); });
  // router.post('/missingUnpaid', (req, res) => { model.reqFixMissingUnpaid(req, res); });

  router.get('/v2/correctTime', (req, res) => { model.reqCorrectTime(req, res); });

  router.get('/history/:currentPageNumber/:itemsPerPage', (req, res) => { controller.loadHistory(req, res); });
  router.get('/loadPage/:currentPageNumber/:itemsPerPage', (req, res) => { controller.loadPage(req, res); });
  router.get('/getByCode/:code', (req, res) => {controller.getByCode(req, res)});
  router.get('/getByPaymentId/:paymentId', (req, res) => { controller.getByPaymentId(req, res) });
  // v1
  router.get('/csv', (req, res) => { model.reqCSV(req, res); });
  router.get('/clients', (req, res) => { model.reqClients(req, res); });
  router.get('/statisticsByClient', (req, res) => { model.reqStatisticsByClient(req, res); });
  router.get('/latestViewed', (req, res) => { model.reqLatestViewed(req, res); });
  
  router.get('/trends', (req, res) => { model.getOrderTrends(req, res); });
  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  router.get('/', (req, res) => { model.list(req, res); });
  
  router.get('/:id', (req, res) => { model.get(req, res); });

  router.put('/updatePurchaseTag', (req, res) => { model.updatePurchaseTag(req, res) });
  router.put('/', (req, res) => { model.replace(req, res); });
  router.post('/checkStripePay', (req, res) => { model.checkStripePay(req, res); });
  router.post('/checkWechatpay', (req, res) => { model.checkWechatpay(req, res); });
  
  //
  router.post('/payOrder', (req, res) => { model.payOrder(req, res); });
  router.post('/', (req, res) => { model.create(req, res); });


  // deprecated
  // router.post('/afterRemoveOrder', (req, res) => { model.afterRemoveOrder(req, res); });

  router.patch('/fixCancelledTransaction', (req, res) => { model.fixCancelledTransaction(req, res); });
  router.patch('/updateDelivered', (req, res) => { model.updateDeliveryTime(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });
  

  // router.post('/checkGroupDiscount', (req, res) => { model.checkGroupDiscount(req, res); });


  return router;
};


export class OrderController extends Model {
  model: Order;
  accountModel: Account;
  productModel: Product;
  constructor(db: DB) {
    super(db, 'orders');
    this.model = new Order(db);
    this.accountModel = new Account(db);
    this.productModel = new Product(db);
  }

  listV2(req: Request, res: Response) {
    let query = null;

    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    this.model.joinFindV2(query).then((rs: any[]) => {
      res.setHeader('Content-Type', 'application/json');
      if (rs) {
        res.send(JSON.stringify(rs, null, 3));
      } else {
        res.send(JSON.stringify(null, null, 3))
      }
    });
  }

  loadPage(req: Request, res: Response) {
    const itemsPerPage = +req.params.itemsPerPage;
    const currentPageNumber = +req.params.currentPageNumber;

    let query = null;
    let fields = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    if (req.headers && req.headers.fields && typeof req.headers.fields === 'string') {
      fields = (req.headers && req.headers.fields) ? JSON.parse(req.headers.fields) : null;
    }

    if (query.hasOwnProperty('pickup')) {
      query.delivered = this.model.getPickupDateTime(query['pickup']);
      delete query.pickup;
    }
    let q = query ? query : {};

    res.setHeader('Content-Type', 'application/json');

    this.model.loadPage(query, itemsPerPage, currentPageNumber).then(arr => {
      const len = arr.length;
      if (arr && arr.length > 0) {
        res.send(JSON.stringify({ total: len, orders: arr }, null, 3));
      } else {
        res.send(JSON.stringify({ total: len, orders: [] }, null, 3));
      }
    });
  }

  

  // return [{_id, address, description,items, merchantName, clientPhoneNumber, price, total, tax, delivered, created}, ...]
  loadHistory(req: Request, res: Response) {
    const itemsPerPage = +req.params.itemsPerPage;
    const currentPageNumber = +req.params.currentPageNumber;

    let query = null;
    // let fields = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    // if (req.headers && req.headers.fields && typeof req.headers.fields === 'string') {
    //   fields = (req.headers && req.headers.fields) ? JSON.parse(req.headers.fields) : null;
    // }

    // let q = query ? query : {};
    let clientId = query.clientId;

    this.model.loadHistory(clientId, itemsPerPage, currentPageNumber).then(r => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(r, null, 3));
    });
  }

  async getByCode(req: Request, res: Response) {
    const code = req.params.code;
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }
    if (!query || !query.clientId) {
      return res.json({
        code: Code.FAIL,
        message: 'authentication failed'
      });
    }
    const client = await this.accountModel.findOne({ _id: query.clientId });
    if (!client) {
      return res.json({
        code: Code.FAIL,
        message: 'authentication failed'
      });
    }
    const order = await this.model.findOne({
      code,
      clientId: query.clientId
    });
    if (!order) {
      return res.json({
        code: Code.FAIL,
        message: 'no such order'
      });
    }
    return res.json({
      code: Code.SUCCESS,
      data: await this.getOrderDetail(order)
    });
  }

  async getByPaymentId(req: Request, res: Response) {
    const paymentId = req.params.paymentId;
    let query = null;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }
    if (!query || !query.clientId) {
      return res.json({
        code: Code.FAIL,
        message: 'authentication failed'
      });
    }
    const client = await this.accountModel.findOne({ _id: query.clientId });
    if (!client) {
      return res.json({
        code: Code.FAIL,
        message: 'authentication failed'
      });
    }
    const orders = await this.model.find({ paymentId, clientId: query.clientId });
    const data = [];
    for (let order of orders) {
      data.push(await this.getOrderDetail(order));
    }
    return res.json({
      code: Code.SUCCESS,
      data
    });
  }

  async getOrderDetail(order: IOrder) {
    const client = await this.accountModel.findOne({ _id: order.clientId });
    const items = [];
    if (order.items) {
      for (let item of order.items) {
        const product = await this.productModel.findOne({ _id: item.productId });
        if (product) {
          items.push({ product, quantity: item.quantity, price: item.price });
        }
      }
    }
    const description = this.model.getDescription(order, 'zh');
    const address = this.model.locationModel.getAddrString(order.location);
    return { ...order, address, description, items, clientPhoneNumber: client.phone };
  }

  async placeOrders(req: Request, res: Response) {
    const orders: any = req.body;
    try {
      const savedOrders: IOrder[] = await this.model.placeOrders(orders);
      for (let order of savedOrders) {
        if (order.status === OrderStatus.NEW) {
          console.log(`Change product quantity after payment (type: ${order.paymentMethod}). Order ID: ${order._id}`);
          logger.info(`Change product quantity after payment (type: ${order.paymentMethod}). Order ID: ${order._id}`);
          await this.model.changeProductQuantity(order);
        }
      }
      res.setHeader('Content-Type', 'application/json');
      res.send({
        code: Code.SUCCESS,
        data: savedOrders 
      });
    } catch (e) {
      res.json({
        code: Code.FAIL,
        data: e
      });
    }
  }

  async removeOrder(req: Request, res: Response) {
    const orderId = req.params.id;
    if(orderId){
      const x = await this.model.doRemoveOne(orderId);
      res.setHeader('Content-Type', 'application/json');
      res.send(x);
    }else{
      res.send();
    }
  }
  
  async validateCart(req: Request, res: Response) {
    const items = req.body.items;
    if (!items) {
      return res.json({
        code: Code.SUCCESS
      });
    }
    for (let item of items) {
      
    }
  }
}