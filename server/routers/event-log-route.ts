import express, { Request, Response }  from "express";
import { DB } from "../db";
import { EventLog } from "../models/event-log";
import { Model } from "../models/model";

export function EventLogRouter(db: DB){
  const router = express.Router();
  const model = new EventLog(db);
  const controller = new EventLogController(db);

  router.post('/', (req, res) => { controller.create(req, res); });

  router.get('/loadPage/:currentPageNumber/:itemsPerPage', (req, res) => { model.loadPage(req, res); });

  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });

  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });

  router.delete('/:id', (req, res) => { model.removeOne(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};

class EventLogController extends Model{
  model: EventLog;

  constructor(db: DB) {
    super(db, 'event_logs');
    this.model = new EventLog(db);
  }

  create(req: Request, res: Response) {
    this.insertOne(req.body).then((x: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(x, null, 3));
    });
  }
}