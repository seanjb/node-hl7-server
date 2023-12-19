import fs from "fs";
import path from "node:path";
import portfinder from 'portfinder'
import tcpPortUsed from 'tcp-port-used'
import {InboundRequest, Server} from '../src'
import {expectEvent} from "./__utils__";

describe('node hl7 server', () => {

  describe('sanity tests - server class', () => {

    test(`error - bindAddress has to be string`, async  () => {
      try {
        // @ts-expect-error this is not a string
        new Server({bindAddress: 351123})
      } catch (err: any) {
        expect(err.message).toBe('bindAddress is not valid string.')
      }
    })

    test(`error - ipv4 and ipv6 both can not be true exist`, async  () => {
      try {
      new Server({ipv6: true, ipv4: true})
      } catch (err: any) {
        expect(err.message).toBe('ipv4 and ipv6 both can\'t be set to be exclusive.')
      }
    })

    test(`error - ipv4 not empty`, async  () => {
      try {
        new Server({bindAddress: ""})
      } catch (err: any) {
        expect(err.message).toBe('bindAddress is an invalid ipv4 address.')
      }
    })

    test(`error - ipv4 not valid address`, async  () => {
      try {
        new Server({bindAddress: "123.34.52.455"})
      } catch (err: any) {
        expect(err.message).toBe('bindAddress is an invalid ipv4 address.')
      }
    })

    test(`error - ipv6 not empty`, async  () => {
      try {
        new Server({bindAddress: "", ipv6: true, ipv4: false})
      } catch (err: any) {
        expect(err.message).toBe('bindAddress is an invalid ipv6 address.')
      }
    })

    test(`error - ipv6 not valid address`, async  () => {
      try {
        new Server({bindAddress: "2001:0db8:85a3:0000:zz00:8a2e:0370:7334", ipv6: true, ipv4: false})
      } catch (err: any) {
        expect(err.message).toBe('bindAddress is an invalid ipv6 address.')
      }
    })

    test(`error - ipv6 valid address`, async  () => {
      try {
        new Server({bindAddress: "2001:0db8:85a3:0000:0000:8a2e:0370:7334", ipv6: true, ipv4: false})
      } catch (err: any) {
        expect(err.message).toBeUndefined()
      }
    })

    test(`properties exist`, async  () => {
      const server = new Server()
      expect(server).toHaveProperty("createInbound")
    })

  })

  describe('sanity tests - listener class', () => {

    test('error - no port specified', async () => {

      try {
        const server = new Server()
        // @ts-expect-error port is not specified
        server.createInbound()
      } catch (err: any) {
        expect(err.message).toBe('port is not defined.')
      }

    })

    test('error - port not a number', async  () => {
      try {
        const server = new Server()
        // @ts-expect-error port is not specified
        server.createInbound({ port: "12345"}, async () => {})
      } catch (err: any) {
        expect(err.message).toBe('port is not valid number.')
      }
    })

    test('error - port less than 0', async () => {
      try {
        const server = new Server()
        server.createInbound({ port: -1}, async () => {})
      } catch (err: any) {
        expect(err.message).toBe('port must be a number (0, 65353).')
      }
    })

    test('error - port greater than 65353', async () => {
      try {
        const server = new Server()
        server.createInbound({ port: 65354}, async () => {})
      } catch (err: any) {
        expect(err.message).toBe('port must be a number (0, 65353).')
      }
    })

    test('error - name is invalid', async () => {
      try {
        const server = new Server()
        server.createInbound({ name: "$#@!sdfe-`", port: 65354}, async () => {})
      } catch (err: any) {
        expect(err.message).toContain(`name must not contain certain characters: \`!@#$%^&*()+\\-=\\[\\]{};':\"\\\\|,.<>\\/?~.`)
      }
    })

    test('error - getMessage() - no message passed to inbound request', async() => {
      try {
        // @ts-expect-error no message.
        const inboundReq = new InboundRequest()
        // this should cause an error
        inboundReq.getMessage()
      } catch (err: any) {
        expect(err.message).toBe("Message is not defined.")
      }
    })

  })

  describe('basic server tests', () => {
    let LISTEN_PORT: number;

    beforeEach(async () => {
      LISTEN_PORT = await portfinder.getPortPromise({
        port: 3000,
        stopPort: 65353
      })
    })

    test('...listen on a randomized port', async () => {
      const server = new Server()
      const listener = server.createInbound({ port: LISTEN_PORT}, async () => {})
      const usedCheck = await tcpPortUsed.check(LISTEN_PORT, '0.0.0.0')

      expect(usedCheck).toBe(true)

      await listener.close()

    })

    test('...should not be able to listen on the same port', async () => {
      const server = new Server()
      const listenerOne = server.createInbound({ port: LISTEN_PORT}, async () => {})
      const listenerTwo = server.createInbound({ port: LISTEN_PORT}, async () => {})

      await expectEvent(listenerTwo, 'error')

      await listenerOne.close()

    })

    test('...two different ports', async () => {
      const server = new Server()
      const listenerOne = server.createInbound({ port: LISTEN_PORT}, async () => {})
      const listenerTwo = server.createInbound({ port: await portfinder.getPortPromise({
          port: 3001,
          stopPort: 65353
        })}, async () => {})

      await listenerOne.close()
      await listenerTwo.close()

    })

    test('...use tls', async () => {

      const server = new Server(
        {
          tls:
            {
              key: fs.readFileSync(path.join('certs/', 'server-key.pem')),
              cert: fs.readFileSync(path.join('certs/', 'server-crt.pem')),
              rejectUnauthorized: false
            }
        })
      const listener = server.createInbound({ port: LISTEN_PORT}, async () => {})

      const usedCheck = await tcpPortUsed.check(LISTEN_PORT, '0.0.0.0')

      expect(usedCheck).toBe(true)

      await listener.close()
    })

  })

})