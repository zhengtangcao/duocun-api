import express from "express";
import { DB } from "../db";
import { Order } from "../models/order";

export function OrderRouter(db: DB){
  const router = express.Router();
  const controller = new Order(db);

  router.get('/qFind', (req, res) => { controller.quickFind(req, res); });
  router.get('/', (req, res) => { controller.list(req, res); });
  router.get('/:id', (req, res) => { controller.get(req, res); });

  router.put('/updatePurchaseTag', (req, res) => { controller.updatePurchaseTag(req, res)});
  router.put('/', (req, res) => { controller.replace(req, res); });

  router.post('/pay', (req, res) => { controller.payOrder(req, res); });
  router.post('/processPayment', (req, res) => { controller.processPayment(req, res); });
  router.post('/afterAddOrder', (req, res) => { controller.afterAddOrder(req, res); });
  router.post('/afterRemoveOrder', (req, res) => { controller.afterRemoveOrder(req, res); });
  router.post('/', (req, res) => { controller.create(req, res); });

  router.patch('/updateDelivered', (req, res) => { controller.updateDeliveryTime(req, res); });
  router.patch('/', (req, res) => { controller.update(req, res); });
  router.delete('/', (req, res) => { controller.remove(req, res); });
  router.delete('/:id', (req, res) => { controller.removeOrder(req, res); });

  router.post('/checkGroupDiscount', (req, res) => { controller.checkGroupDiscount(req, res); });

  return router;
};