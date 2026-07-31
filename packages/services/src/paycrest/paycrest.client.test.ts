import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { PaycrestClient } from './paycrest.client.js';

type MockClient = {
  get: ReturnType<typeof mock.fn>;
  post: ReturnType<typeof mock.fn>;
};

function mockAxiosClient(): MockClient {
  const http: MockClient = {
    get: mock.fn(),
    post: mock.fn(),
  };
  mock.method(axios, 'create', () => http);
  return http;
}

afterEach(() => {
  mock.restoreAll();
});

describe('PaycrestClient — happy paths', () => {
  it('getRate parses sell.rate and builds PaycrestRate', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => ({
      data: {
        data: { sell: { rate: '1600.5' } },
        fixed_fee: 1,
        variable_fee: 0.1,
      },
    }));

    const client = new PaycrestClient('test-key');
    const rate = await client.getRate('base', 'USDC', '100', 'NGN');

    assert.equal(rate.source_currency, 'USDC');
    assert.equal(rate.destination_currency, 'NGN');
    assert.equal(rate.rate, 1600.5);
    assert.equal(rate.fixed_fee, 1);
    assert.equal(rate.variable_fee, 0.1);

    const [path] = http.get.mock.calls[0].arguments as [string];
    assert.equal(path, '/rates/base/USDC/100/NGN');
  });

  it('getRate falls back to data.rate then top-level rate', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => ({
      data: { data: { rate: '1500' } },
    }));

    const client = new PaycrestClient('test-key');
    const rate = await client.getRate('celo', 'USDC', '50', 'KES');
    assert.equal(rate.rate, 1500);
  });

  it('getInstitutions returns data array', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => ({
      data: {
        data: [{ id: '1', name: 'GTBank', code: '058', type: 'bank' }],
      },
    }));

    const client = new PaycrestClient('test-key');
    const list = await client.getInstitutions('NG');
    assert.equal(list.length, 1);
    assert.equal(list[0].code, '058');
    assert.equal(http.get.mock.calls[0].arguments[0], '/institutions/NG');
  });

  it('verifyAccount posts camelCase fields', async () => {
    const http = mockAxiosClient();
    http.post.mock.mockImplementation(async () => ({
      data: { data: 'Jane Doe' },
    }));

    const client = new PaycrestClient('test-key');
    const name = await client.verifyAccount({
      institution: '058',
      accountIdentifier: '0123456789',
    });

    assert.equal(name, 'Jane Doe');
    const [path, body] = http.post.mock.calls[0].arguments as [string, Record<string, string>];
    assert.equal(path, '/verify-account');
    assert.equal(body.institution, '058');
    assert.equal(body.accountIdentifier, '0123456789');
  });

  it('createOrder posts camelCase v2 payload', async () => {
    const http = mockAxiosClient();
    http.post.mock.mockImplementation(async () => ({
      data: {
        data: {
          id: 'ord_1',
          status: 'pending',
          providerAccount: { receiveAddress: '0xabc' },
        },
      },
    }));

    const client = new PaycrestClient('test-key');
    const order = await client.createOrder({
      amount: '100',
      source: {
        type: 'crypto',
        currency: 'USDC',
        network: 'base',
        refundAddress: '0xrefund',
      },
      destination: {
        type: 'fiat',
        currency: 'NGN',
        recipient: {
          institution: '058',
          accountIdentifier: '0123456789',
          accountName: 'Jane Doe',
          memo: 'fx',
        },
      },
      reference: 'ref-1',
    });

    assert.equal(order.id, 'ord_1');
    assert.equal(order.status, 'pending');

    const [path, payload] = http.post.mock.calls[0].arguments as [
      string,
      {
        amount: string;
        source: { currency: string; network: string };
        destination: { currency: string; recipient: { institution: string } };
        reference: string;
      },
    ];
    assert.equal(path, '/sender/orders');
    assert.equal(payload.amount, '100');
    assert.equal(payload.source.currency, 'USDC');
    assert.equal(payload.source.network, 'base');
    assert.equal(payload.destination.currency, 'NGN');
    assert.equal(payload.destination.recipient.institution, '058');
    assert.equal(payload.reference, 'ref-1');
  });

  it('getOrder fetches by id', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => ({
      data: { data: { id: 'ord_2', status: 'fulfilled' } },
    }));

    const client = new PaycrestClient('test-key');
    const order = await client.getOrder('ord_2');
    assert.equal(order.status, 'fulfilled');
    assert.equal(http.get.mock.calls[0].arguments[0], '/sender/orders/ord_2');
  });

  it('getAggregatorPublicKey reads public_key', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => ({
      data: { public_key: 'pk_test' },
    }));

    const client = new PaycrestClient('test-key');
    assert.equal(await client.getAggregatorPublicKey(), 'pk_test');
  });
});

describe('PaycrestClient — unhappy paths', () => {
  it('getRate rejects when rate fields are missing', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => ({ data: { data: {} } }));

    const client = new PaycrestClient('test-key');
    await assert.rejects(
      () => client.getRate('base', 'USDC', '10', 'NGN'),
      /Invalid response format from Paycrest rates API/,
    );
  });

  it('maps 503 to liquidity unavailable message', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => {
      const err: any = new Error('Request failed');
      err.response = { status: 503, data: { message: 'unavailable' } };
      throw err;
    });

    const client = new PaycrestClient('test-key');
    await assert.rejects(
      () => client.getRate('base', 'USDC', '10', 'NGN'),
      (err: any) => {
        assert.match(err.message, /Liquidity Provider Unavailable/);
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it('maps 429 to rate-limit message', async () => {
    const http = mockAxiosClient();
    http.post.mock.mockImplementation(async () => {
      const err: any = new Error('Request failed');
      err.response = { status: 429, data: {} };
      throw err;
    });

    const client = new PaycrestClient('test-key');
    await assert.rejects(
      () =>
        client.verifyAccount({
          institution: '058',
          accountIdentifier: '000',
        }),
      (err: any) => {
        assert.match(err.message, /Rate limit exceeded/);
        assert.equal(err.status, 429);
        return true;
      },
    );
  });

  it('maps field validation errors from data array', async () => {
    const http = mockAxiosClient();
    http.post.mock.mockImplementation(async () => {
      const err: any = new Error('Request failed');
      err.response = {
        status: 400,
        data: {
          data: [{ field: 'Amount', message: 'must be greater than 0' }],
        },
      };
      throw err;
    });

    const client = new PaycrestClient('test-key');
    await assert.rejects(
      () => client.createOrder({ amount: '0' }),
      (err: any) => {
        assert.equal(err.message, 'Amount: must be greater than 0');
        assert.equal(err.status, 400);
        return true;
      },
    );
  });

  it('uses response message when present for other HTTP errors', async () => {
    const http = mockAxiosClient();
    http.get.mock.mockImplementation(async () => {
      const err: any = new Error('Request failed');
      err.response = { status: 401, data: { message: 'Invalid API key' } };
      throw err;
    });

    const client = new PaycrestClient('test-key');
    await assert.rejects(
      () => client.getOrder('missing'),
      (err: any) => {
        assert.equal(err.message, 'Invalid API key');
        assert.equal(err.status, 401);
        return true;
      },
    );
  });

  it('rethrows non-response network errors unchanged', async () => {
    const http = mockAxiosClient();
    const networkErr = new Error('socket hang up');
    http.get.mock.mockImplementation(async () => {
      throw networkErr;
    });

    const client = new PaycrestClient('test-key');
    await assert.rejects(() => client.getInstitutions('NG'), (err) => {
      assert.equal(err, networkErr);
      return true;
    });
  });
});
