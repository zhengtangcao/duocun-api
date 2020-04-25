import express, {Request, Response}from "express";
import { DB } from "../db";
import { Category } from "../models/category";
import { Model, Code } from "../models/model";
import { AppType } from "../models/area";

export function CategoryRouter(db: DB){
  const router = express.Router();
  const model = new Category(db);
  const controller = new CategoryController(db);

  // yaml api
  router.get('/G/root', (req, res) => { controller.gv1_list(req, res); });
  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });
  router.get('/G/:id', (req, res) => { controller.gv1_getById(req, res); });

  // old api
  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });
  router.post('/', (req, res) => { model.create(req, res); });
  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};


export class CategoryController extends Model{
  model: Category;
  constructor(db: DB) {
    super(db, 'categories');
    this.model = new Category(db);
  }

  gv1_getById(req: Request, res: Response) {
    const id = req.params.id;
    this.model.getById(id).then(area => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: area ? Code.SUCCESS : Code.FAIL,
        data: area 
      }));
    });
  }

  gv1_list(req: Request, res: Response) {
    const status = req.query.status;
    // const appType = AppType.GROCERY;
    const query = {status}; // status ? {status, appType} : {appType};

    this.model.find(query).then((categories) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: categories 
      }));
    });
  }
};