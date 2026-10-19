// Prévision de fin de mois : lit les données, le calcul est dans le module pur forecast.js.
const express = require('express');
const { db } = require('../db');
const { fromCents, auth, view, HttpError } = require('../lib');
const { generateRecurring, localToday } = require('../recurring');
const { forecast } = require('../forecast');
const { addMonths } = require('../dates');
const { FAMILIES, SPENDABLE, SAVINGS, sqlList } = require('../accounts');

const router = express.Router();

/** Prévision du mois en cours (chiffres réels pour un mois passé). */
function forecastOf(userId, query = {}) {
  const uid = userId;
  const now = localToday();
  const month = query.month || now.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Mois invalide (attendu AAAA-MM)');
  if (month > now.slice(0, 7)) throw new HttpError(400, 'La prévision ne porte que sur le mois en cours');
  generateRecurring(uid);

  const liquid = sqlList(FAMILIES.liquid);
  const from = addMonths(`${month}-01`, -3);
  const transactions = db.prepare(`
    SELECT t.date, t.amount, t.transfer_id, t.recurring_id FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${liquid} AND t.date >= ? AND substr(t.date,1,7) <= ?`).all(uid, from, month);
  const firstDate = db.prepare(`SELECT MIN(t.date) d FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE t.user_id = ? AND a.type IN ${liquid}`).get(uid).d;
  const rules = db.prepare(`
    SELECT r.*, a.type AS from_type, ta.type AS to_type FROM recurring r
    JOIN accounts a ON a.id = r.account_id LEFT JOIN accounts ta ON ta.id = r.to_account_id
    WHERE r.user_id = ? AND r.paused = 0`).all(uid)
    // une récurrence (hors virement) sur un placement ou une dette ne compte pas dans le budget
    .filter((r) => r.to_account_id || FAMILIES.liquid.includes(r.from_type))
    .map((r) => ({
      ...r,
      from_spendable: SPENDABLE.includes(r.from_type),
      to_spendable: SPENDABLE.includes(r.to_type),
      to_savings: SAVINGS.includes(r.to_type),
    }));
  const spendableBalance = db.prepare(`
    SELECT COALESCE(SUM(a.initial_balance + (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE account_id = a.id)), 0) AS b
    FROM accounts a WHERE a.user_id = ? AND a.type IN ${sqlList(SPENDABLE)}`).get(uid).b;

  const f = forecast({ now, month, transactions, firstDate, rules, spendableBalance });
  const euros = Object.fromEntries(Object.entries(f).map(([k, v]) =>
    [k, typeof v === 'number' && !['days_in_month', 'days_remaining', 'history_months'].includes(k) ? fromCents(v) : v]));
  return euros;
}

router.get('/api/forecast', auth, view(forecastOf));

module.exports = Object.assign(router, { forecastOf });
