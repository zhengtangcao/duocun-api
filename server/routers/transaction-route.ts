import express, { Request, Response }  from "express";
import { DB } from "../db";
import { Transaction } from "../models/transaction";
import { Model, Code } from "../models/model";

export function TransactionRouter(db: DB){
  const router = express.Router();
  const model = new Transaction(db);
  const controller = new TransactionController(db);

  router.get('/page/:clientId/:currentPageNumber/:itemsPerPage', (req, res) => { controller.getPage(req, res); });

  router.get('/getMerchantBalance', (req, res) => { model.getMerchantBalance(req, res); });
  router.get('/loadPage/:currentPageNumber/:itemsPerPage', (req, res) => { model.loadPage(req, res); });
  router.get('/sales', (req, res) => { model.getSales(req, res); });
  router.get('/cost', (req, res) => { model.getCost(req, res); });
  router.get('/merchantPay', (req, res) => { model.getMerchantPay(req, res); });
  router.get('/salary', (req, res) => { model.getSalary(req, res); });

  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  router.get('/', (req, res) => { model.list(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });

  router.post('/', (req, res) => { model.create(req, res); });

  router.put('/', (req, res) => { model.replace(req, res); });

  // tools
  // admin tools
  router.patch('/updateAccount', (req, res) => { model.updateAccount(req, res); });
  router.patch('/updateBalances', (req, res) => { model.updateBalances(req, res); });
  // router.patch('/fixCancelTransactions', (req, res) => { model.fixCancelTransactions(req, res); });
  // router.patch('/changeAccount', (req, res) => { model.changeAccount(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });

  
  router.delete('/:id', (req, res) => { model.removeOne(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};


export class TransactionController extends Model {
  model: Transaction;
  constructor(db: DB) {
    super(db, 'transactions');
    this.model = new Transaction(db);
  }

  getPage(req: Request, res: Response) {
    const clientId = req.params.clientId;
    const itemsPerPage = +req.params.itemsPerPage;
    const currentPageNumber = +req.params.currentPageNumber;

    res.setHeader('Content-Type', 'application/json');

    this.model.loadPageV2(clientId, itemsPerPage, currentPageNumber).then(data => {
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        total: data.total,
        data: data.transactions 
      }));
    });
  }
}