import express from "express";
import { Area, IArea, AppType } from "../models/area";
import { DB } from "../db";
import { Request, Response } from "express";
import { Model, Code } from "../models/model";

export function AreaRouter(db: DB){
  const router = express.Router();
  const controller = new AreaController(db);

  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });
  router.get('/G/my', (req, res) => { controller.gv1_getMyArea(req, res); }); 


  router.get('/my', (req, res) => { controller.reqMyArea(req, res); }); // fix me
  router.get('/qFind', (req, res) => { controller.quickFind(req, res); });
  router.get('/', (req, res) => { controller.quickFind(req, res); });
  router.get('/:id', (req, res) => { controller.get(req, res); });
  router.post('/', (req, res) => { controller.create(req, res); });
  router.patch('/', (req, res) => { controller.update(req, res); });
  
  // fix me
  
  router.post('/nearest', (req, res) => {controller.getNearest(req, res); });
  
  // router.put('/', (req, res) => { controller.replace(req, res); });
  // router.delete('/', (req, res) => { controller.remove(req, res); });
  
  return router;
}

export class AreaController extends Model{
  model: Area;
  constructor(db: DB) {
    super(db, 'users');
    this.model = new Area(db);
  }

  getNearest(req: Request, res: Response) {
    const origin = req.body.origin;
    this.model.getNearestArea(origin).then((area: IArea) => {
      res.setHeader('Content-Type', 'application/json');
      if (!area) {
        res.send(JSON.stringify({ status: 'fail', area: '' }, null, 3));
      } else {
        res.send(JSON.stringify({ status: 'success', area: area }, null, 3));
      }
    });
  }

  reqMyArea(req: Request, res: Response) {
    let data;
    let fields;
    if (req.headers) {
      if (req.headers.data && typeof req.headers.data === 'string') {
        data = JSON.parse(req.headers.data);
      }

      if (req.headers.fields && typeof req.headers.fields === 'string') {
        fields = JSON.parse(req.headers.fields);
      }
    }
    this.model.getMyArea(data.location, AppType.GROCERY).then(area => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(area, null, 3));
    });
  }

  quickFind(req: Request, res: Response) {
    let query: any = {};
    let fields;
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    }

    if (req.headers.fields && typeof req.headers.fields === 'string') {
      fields = JSON.parse(req.headers.fields);
    }

    this.model.find(query, null, fields).then((x: any) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(x, null, 3));
    });
  }


  gv1_getMyArea(req: Request, res: Response) {
    const lat = req.query.lat? +req.query.lat : 0;
    const lng = req.query.lng? +req.query.lng : 0;
    this.model.getMyArea({lat, lng}, AppType.GROCERY).then(area => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: area ? Code.SUCCESS : Code.FAIL,
        data: area 
      }));
    });
  }

  
  gv1_list(req: Request, res: Response) {
    const status = req.query.status;
    const appType = AppType.GROCERY;
    const query = status ? {status, appType} : {appType};

    this.model.find(query).then((areas) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: areas 
      }));
    });
  }
};