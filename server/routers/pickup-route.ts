import express from "express";
import { PickupController } from "../controllers/pickup-controller";
import { DB } from "../db";
import { Pickup } from "../models/pickup";

export function PickupRouter(db: DB){
  const router = express.Router();
  const model = new Pickup(db);
  const controller = new PickupController(model, db);

  router.get('/', (req, res) => { controller.list(req, res); });
  router.put('/', (req, res) => { controller.updateOne(req, res); });
  router.post('/', (req, res) => { controller.create(req, res); });

  router.get('/:id', (req, res) => { model.get(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};
