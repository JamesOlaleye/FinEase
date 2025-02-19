import { Request, Response } from "express";
import Transaction from "../models/transaction";
import * as validators from "../utils/validators";
import { calcBalance, verifyTransaction, generateReference, blocApi } from "../utils/utils";
import User from "../models/users";
import { phoneNetworks } from "../utils/constants";

export async function fundWallet(req: Request, res: Response) {
  try {
    const user = req.user.id;
    const { reference } = req.body;

    const processed = await Transaction.findOne({ reference });
    if (processed) {
      res.status(409);
      return res.json({
        success: false,
        message: 'Stale transaction',
        error: 'This transaction has already been processed',
      });
    }

    const response = await verifyTransaction(reference);

    if (!response.status) {
      res.status(422);
      return res.json({
        success: false,
        message: "Transaction failed",
        error: "Could not confirm transaction"
      })
    }

    const { amount } = response.data;

    await Transaction.create({
      user,
      amount,
      type: 'credit',
      service: 'funding',
      description: 'Funding via Paystack',
      reference,
      serviceProvider: 'Paystack',
    });

    res.status(201);
    return res.json({
      success: true,
      message: "Wallet funded successfully",
      amount,
      balance: await calcBalance(user)
    });
  }

  catch (error: any) {
    console.error(error);
    res.status(500);
    return res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

export async function transferFunds(req: Request, res: Response) {
  const user = req.user.id;

  try {
    const { error } = validators.transferFunds.validate(req.body, validators.options);

    if (error) {
      res.status(400);
      return res.json({
        success: false,
        message: error.message,
        error: 'Bad request'
      });
    }

    const { acctNoOrUsername } = req.body;
    const amount = req.body.amount * 100;  // convert to kobo

    const requiredInfo = 'username fullName email phone';
    const recipient = await User.findOne({ acctNo: acctNoOrUsername }).select(requiredInfo) || await User.findOne({ username: acctNoOrUsername }).select(requiredInfo);

    // check if recipient exists
    if (!recipient) {
      res.status(404);
      return res.json({
        success: false,
        message: 'Recipient not found!',
        error: 'Not found'
      });
    }

    // check if sender has sufficient balance
    const userBalance = await calcBalance(user);
    if (userBalance < amount) {
      res.status(402);
      return res.json({
        success: false,
        message: 'You do not have enough funds',
        error: 'Insufficient funds'
      });
    }

    if (recipient.id === user) {
      res.status(409);
      return res.json({
        success: false,
        message: 'Cannot transfer funds to self',
        error: 'Conflict'
      })
    }

    // create debit transaction
    const transaction = await Transaction.create({
      user,
      amount,
      type: 'debit',
      service: 'wallet transfer',
      description: `Wallet transfer to ${recipient.username}`,
      reference: await generateReference('WTR'),
      serviceProvider: 'Wallet2Wallet',
      recipient: recipient._id,
    });

    // create credit transaction
    await Transaction.create({
      user: recipient._id,
      amount,
      type: 'credit',
      service: 'wallet transfer',
      description: `Wallet transfer from ${req.user.username}`,
      reference: await generateReference('RW'),
      serviceProvider: 'Wallet2Wallet',
      sender: user,
    });

    return res.json({
      success: true,
      message: `Funds sent to ${recipient.username} successfully!`,
      balance: await calcBalance(user),
      amount: amount / 100,
      reference: transaction.reference,
    });
  }

  catch (error: any) {
    console.error(error);
    res.status(500);
    return res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

export async function getTransactions(req: Request, res: Response) {
  try {
    const user = req.user.id;
    const requiredInfo = 'amount type reference createdAt description';
    const transactions = await Transaction.find({ user }).sort({ createdAt: -1 }).select(requiredInfo);

    res.status(200);
    return res.json({
      success: true,
      message: `Transaction history for ${req.user.username}`,
      transactions
    });

  } catch (error: any) {
    console.error(error);
    res.status(500);
    return res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

export async function getNetworks(req: Request, res: Response) {
  try {
    const networks = await blocApi.getOperators('telco');
    res.status(200);
    return res.json({
      success: true,
      message: 'Telecom operators',
      networks
    });

  } catch (error: any) {
    console.error(error);
    res.status(500);
    return res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

export function getPhoneNetwork(req: Request, res: Response) {
  const phone = req.query.phone as string;
  const network = phoneNetworks[phone.slice(0, 4)];

  if (!network) {
    res.status(404);
    return res.json({
      success: false,
      message: `Cannot determine network for ${phone}`,
      error: 'Network not found',
    });
  }

  return res.json({
    success: true,
    network,
    phone,
  })
}


export async function getDataPlans(req: Request, res: Response) {
  try {
    const operatorId = req.query.operatorId as string;
    const dataPlans = await blocApi.getDataPlans(operatorId);
    res.json({
      success: true,
      message: 'Data plans',
      dataPlans
    });

  } catch (error: any) {
    res.status(500);
    console.error(error);
    return res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }

}

export async function buyAirtime(req: Request, res: Response) {
  try {
    const user = req.user.id;
    const { error } = validators.rechargeAirtime.validate(req.body, validators.options);

    if (error) {
      res.status(400);
      return res.json({
        success: false,
        message: error.message,
        error: 'Bad request'
      });
    }

    const { operatorId, phone } = req.body;
    const amount = req.body.amount * 100;

    const userBalance = await calcBalance(user);
    if (userBalance < amount) {
      res.status(402);
      return res.json({
        success: false,
        message: 'You do not have enough funds',
        error: 'Insufficient funds'
      });
    }

    const { isMatch } = await blocApi.verifyNetwork(phone, operatorId);
    if (!isMatch) {
      res.status(409);
      return res.json({
        success: false,
        message: 'Phone number and network do not match',
        error: 'Conflict'
      });
    }

    const response = await blocApi.buyAirtime(amount, operatorId, phone);
    const { operator_name } = response.meta_data;

    await Transaction.create({
      user,
      amount,
      type: 'debit',
      service: 'airtime purchase',
      description: `${operator_name} airtime purchase for ${phone}`,
      reference: await generateReference('ATR'),
      serviceProvider: operator_name,
    });

    res.status(201);
    return res.json({
      success: true,
      message: 'Airtime purchased successfully!',
      amount,
      phone,
      balance: await calcBalance(user),
    });

  } catch (error: any) {
    console.error(error);
    res.status(500);
    return res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

export async function buyData(req: Request, res: Response) {
  try {
    const user = req.user.id;
    const { error } = validators.buyData.validate(req.body, validators.options);
    if (error) {
      res.status(400);
      return res.json({
        success: false,
        message: error.message,
        error: 'Bad request'
      });
    }

    const { operatorId, phone, dataPlanId } = req.body;
    const { amount, operator_name, data_value } = await blocApi.getDataPlanMeta(dataPlanId, operatorId);

    const userBalance = await calcBalance(user);

    if (userBalance < amount) {
      res.status(402);
      return res.json({
        success: false,
        message: 'You do not have enough funds',
        error: 'Insufficient funds'
      });
    }

    const { isMatch } = await blocApi.verifyNetwork(phone, operatorId);
    if (!isMatch) {
      res.status(409);
      return res.json({
        success: false,
        message: 'Phone number and network do not match',
        error: 'Conflict'
      });
    }

    await blocApi.buyData(dataPlanId, amount, operatorId, phone);

    await Transaction.create({
      user,
      amount,
      type: 'debit',
      service: 'data purchase',
      description: `${operator_name} ${data_value} data purchase for ${phone}`,
      reference: await generateReference('IDT'),
      serviceProvider: operator_name,
    });

    res.status(201);
    return res.json({
      success: true,
      message: 'Data purchased successfully!',
      amount,
      phone,
      balance: await calcBalance(user),
    });

  } catch (error: any) {
    res.status(500);
    res.json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
}