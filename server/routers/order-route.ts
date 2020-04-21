import express from "express";
import { DB } from "../db";
import { Order } from "../models/order";
import { Request, Response } from "express";
import { Model } from "../models/model";

export function OrderRouter(db: DB) {
  const router = express.Router();
  const model = new Order(db);
  const controller = new OrderController(db);
  // v2
  router.get('/v2/transactions', (req, res) => { model.reqTransactions(req, res); });
  // tools
  // router.post('/missingWechatpayments', (req, res) => { model.reqMissingWechatPayments(req, res); });
  // router.post('/missingPaid', (req, res) => { model.reqFixMissingPaid(req, res); });
  // router.post('/missingUnpaid', (req, res) => { model.reqFixMissingUnpaid(req, res); });

  router.get('/v2/correctTime', (req, res) => { model.reqCorrectTime(req, res); });

  router.get('/history/:currentPageNumber/:itemsPerPage', (req, res) => { controller.loadHistory(req, res); });
  router.get('/loadPage/:currentPageNumber/:itemsPerPage', (req, res) => { controller.loadPage(req, res); });
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
  router.post('/bulk', (req, res) => { model.reqPlaceOrders(req, res); });

  //
  router.post('/payOrder', (req, res) => { model.payOrder(req, res); });
  router.post('/', (req, res) => { model.create(req, res); });


  // deprecated
  // router.post('/afterRemoveOrder', (req, res) => { model.afterRemoveOrder(req, res); });

  router.patch('/fixCancelledTransaction', (req, res) => { model.fixCancelledTransaction(req, res); });
  router.patch('/updateDelivered', (req, res) => { model.updateDeliveryTime(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });
  router.delete('/:id', (req, res) => { model.removeOrder(req, res); });

  // router.post('/checkGroupDiscount', (req, res) => { model.checkGroupDiscount(req, res); });


  return router;
};


export class OrderController extends Model {
  model: Order;

  constructor(db: DB) {
    super(db, 'orders');
    this.model = new Order(db);
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

    this.model.loadHistory(clientId, itemsPerPage, currentPageNumber).then(orders => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({ orders }, null, 3));
    });
  }


}