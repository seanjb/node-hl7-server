import fs from "fs";
import path from "node:path";
import { describe, expect, test } from 'vitest';
import tcpPortUsed from 'tcp-port-used'
import Client, {Batch, Message} from "node-hl7-client";
import {createDeferred, expectEvent} from './__utils__'
import Server from "../src";

describe('node hl7 end to end - client', () => {

  describe('server/client sanity checks', () => {

    test('...simple connect', async () => {

      let dfd = createDeferred<void>()

      const server = new Server({bindAddress: '0.0.0.0'})
      const listener = server.createInbound({port: 3000}, async (req, res) => {
        const messageReq = req.getMessage()
        expect(messageReq.get('MSH.12').toString()).toBe('2.7')
        await res.sendResponse('AA')
        const messageRes = res.getAckMessage()
        expect(messageRes?.get('MSA.1').toString()).toBe('AA')
      })

      await expectEvent(listener, 'listen')

      const client = new Client({ host: '0.0.0.0' })

      const outbound = client.createConnection({ port: 3000 }, async (res) => {
        const messageRes = res.getMessage()
        expect(messageRes.get('MSA.1').toString()).toBe('AA')
        dfd.resolve()
      })

      await expectEvent(outbound, 'connect')

      let message = new Message({
        messageHeader: {
          msh_9_1: 'ADT',
          msh_9_2: 'A01',
          msh_10: 'CONTROL_ID',
          msh_11_1: 'D'
        }
      })

      await outbound.sendMessage(message)

      await dfd.promise

      expect(client.totalSent()).toEqual(1)
      expect(client.totalAck()).toEqual(1)

      await outbound.close()
      await listener.close()

      client.closeAll()

    })

    test('...simple connect ... MSH 9.3 override', async () => {

      let dfd = createDeferred<void>()

      const server = new Server({bindAddress: '0.0.0.0'})
      const listener = server.createInbound({port: 3000, overrideMSH: true }, async (req, res) => {
        const messageReq = req.getMessage()
        expect(messageReq.get('MSH.12').toString()).toBe('2.7')
        await res.sendResponse('AA')
        const messageRes = res.getAckMessage()
        expect(messageRes?.get('MSA.1').toString()).toBe('AA')
        expect(messageRes?.get('MSH.9.3').toString()).toBe('ACK')
      })

      await expectEvent(listener, 'listen')

      const client = new Client({ host: '0.0.0.0' })

      const outbound = client.createConnection({ port: 3000 }, async (res) => {
        const messageRes = res.getMessage()
        expect(messageRes.get('MSA.1').toString()).toBe('AA')
        dfd.resolve()
      })

      await expectEvent(outbound, 'connect')

      let message = new Message({
        messageHeader: {
          msh_9_1: 'ADT',
          msh_9_2: 'A01',
          msh_10: 'CONTROL_ID',
          msh_11_1: 'D'
        }
      })

      await outbound.sendMessage(message)

      await dfd.promise

      expect(client.totalSent()).toEqual(1)
      expect(client.totalAck()).toEqual(1)

      await outbound.close()
      await listener.close()

      client.closeAll()

    })

    test('...send simple message twice, no ACK needed', async () => {

      await tcpPortUsed.check(3000, '0.0.0.0')

      let dfd = createDeferred<void>()

      const server = new Server({bindAddress: '0.0.0.0'})
      const listener = server.createInbound({port: 3000}, async (req, res) => {
        const messageReq = req.getMessage()
        expect(messageReq.get('MSH.12').toString()).toBe('2.7')
        await res.sendResponse('AA')
        const messageRes = res.getAckMessage()
        expect(messageRes?.get('MSA.1').toString()).toBe('AA')
      })

      await expectEvent(listener, 'listen')

      const client = new Client({ host: '0.0.0.0' })
      const outbound = client.createConnection({ port: 3000, waitAck: false }, async () => {
        dfd.resolve()
      })

      await expectEvent(outbound, 'connect')

      let message = new Message({
        messageHeader: {
          msh_9_1: 'ADT',
          msh_9_2: 'A01',
          msh_10: 'CONTROL_ID',
          msh_11_1: 'D'
        }
      })

      await outbound.sendMessage(message)

      await dfd.promise

      expect(client.totalSent()).toEqual(1)
      expect(client.totalAck()).toEqual(1)

      await outbound.close()
      await listener.close()

      client.closeAll()

    })
  })

  describe('server/client failure checks', () => {
    test('...host does not exist, error out', async () => {

      const client = new Client({ host: '0.0.0.0' })
      const outbound = client.createConnection({ port: 1234, maxConnectionAttempts: 1 }, async () => {})

      const error = await expectEvent(outbound, 'client.error')
      expect(error.code).toBe('ECONNREFUSED')
    })

  })

  describe('...no tls', () => {

    describe('...no file', () => {

      test('...send batch with two message, get proper ACK', async () => {

        let dfd = createDeferred<void>()

        const server = new Server({ bindAddress: '0.0.0.0' })
        const inbound = server.createInbound({ port: 3000 }, async (req, res) => {
          const messageReq = req.getMessage()
          expect(messageReq.get('MSH.12').toString()).toBe('2.7')
          await res.sendResponse('AA')
          const messageRes = res.getAckMessage()
          expect(messageRes?.get('MSA.1').toString()).toBe('AA')
        })

        await expectEvent(inbound, 'listen')

        const client = new Client({ host: '0.0.0.0' })
        const outbound = client.createConnection({ port: 3000 }, async (res) => {
          const messageRes = res.getMessage()
          expect(messageRes.get('MSA.1').toString()).toBe('AA')
          dfd.resolve()
        })

        const batch = new Batch()
        batch.start()

        const message = new Message({
          messageHeader: {
            msh_9_1: 'ADT',
            msh_9_2: 'A01',
            msh_10: 'CONTROL_ID',
            msh_11_1: 'D'
          }
        })

        batch.add(message)
        batch.add(message)

        batch.end()

        await outbound.sendMessage(batch)

        await dfd.promise

        expect(client.totalSent()).toEqual(1)
        expect(client.totalAck()).toEqual(1)

        await outbound.close()
        await inbound.close()

        client.closeAll()
      })

    })

  })

  describe('...tls', () => {

    describe('...no file', () => {

      test('...simple', async () => {

        let dfd = createDeferred<void>()

        const server = new Server(
          {
            bindAddress: '0.0.0.0',
            tls:
              {
                key: fs.readFileSync(path.join('certs/', 'server-key.pem')),
                cert: fs.readFileSync(path.join('certs/', 'server-crt.pem')),
                rejectUnauthorized: false
              }
          })
        const inbound = server.createInbound({ port: 3000 }, async (req, res) => {
          const messageReq = req.getMessage()
          expect(messageReq.get('MSH.12').toString()).toBe('2.7')
          await res.sendResponse('AA')
          const messageRes = res.getAckMessage()
          expect(messageRes?.get('MSA.1').toString()).toBe('AA')
        })

        await expectEvent(inbound, 'listen')

        const client = new Client({ host: '0.0.0.0', tls: { rejectUnauthorized: false } })
        const outbound = client.createConnection({ port: 3000 }, async (res) => {
          const messageRes = res.getMessage()
          expect(messageRes.get('MSA.1').toString()).toBe('AA')
          dfd.resolve()
        })

        await expectEvent(outbound, 'connect')

        const message = new Message({
          messageHeader: {
            msh_9_1: 'ADT',
            msh_9_2: 'A01',
            msh_10: 'CONTROL_ID',
            msh_11_1: 'D'
          }
        })

        await outbound.sendMessage(message)

        dfd.promise

        await outbound.close()
        await inbound.close()

        client.closeAll()

      })

    })

  })

})
