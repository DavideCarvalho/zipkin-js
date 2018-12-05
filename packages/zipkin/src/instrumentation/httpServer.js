import Annotation from '../annotation';
const Header = require('../httpHeaders');
const InetAddress = require('../InetAddress');
const TraceId = require('../tracer/TraceId');
const parseRequestUrl = require('../parseUrl');
import { Some, None } from '../option';

function stringToBoolean(str) {
  return str === '1' || str === 'true';
}

function stringToIntOption(str) {
  try {
    return new Some(parseInt(str));
  } catch (err) {
    return None;
  }
}

function containsRequiredHeaders(readHeader) {
  return readHeader(Header.TraceId) !== None && readHeader(Header.SpanId) !== None;
}

function requiredArg(name) {
  throw new Error(`HttpServerInstrumentation: Missing required argument ${name}.`);
}

class HttpServerInstrumentation {
  constructor({
    tracer = requiredArg('tracer'),
    serviceName = tracer.localEndpoint.serviceName,
    host,
    port = requiredArg('port'),
    serverTags = {}
  }) {
    this.tracer = tracer;
    this.serviceName = serviceName;
    this.host = host && new InetAddress(host);
    this.port = port;
    this.serverTags = serverTags;
  }

  _createIdFromHeaders(readHeader) {
    if (containsRequiredHeaders(readHeader)) {
      const spanId = readHeader(Header.SpanId);
      const parentId = spanId.map(sid => {
        const traceId = readHeader(Header.TraceId);
        const parentSpanId = readHeader(Header.ParentSpanId);
        const sampled = readHeader(Header.Sampled);
        const flags = readHeader(Header.Flags).flatMap(stringToIntOption).getOrElse(0);
        return new TraceId({
          traceId,
          parentId: parentSpanId,
          spanId: sid,
          sampled: sampled.map(stringToBoolean),
          flags
        });
      });
      return !this.tracer.supportsJoin
        ? parentId.map(id =>
            this.tracer.letId(id, () =>
              this.tracer.createChildId()
            )
          )
        : parentId;
    } else {
      if (readHeader(Header.Flags) !== None || readHeader(Header.Sampled) !== None) {
        const sampled = readHeader(Header.Sampled) === None ?
              None : readHeader(Header.Sampled).map(stringToBoolean);
        const flags = readHeader(Header.Flags).flatMap(stringToIntOption).getOrElse(0);
        return new Some(this.tracer.createRootId(sampled, flags === 1));
      } else {
        return new Some(this.tracer.createRootId());
      }
    }
  }

  recordRequest(method, requestUrl, readHeader) {
    this._createIdFromHeaders(readHeader).ifPresent(id => this.tracer.setId(id));
    const id = this.tracer.id;
    const {path} = parseRequestUrl(requestUrl);

    this.tracer.recordServiceName(this.serviceName);
    this.tracer.recordRpc(method.toUpperCase());
    this.tracer.recordBinary('http.path', path);

    if (this.serverTags) {
      this.tracer.setTags(this.serverTags);
    }

    this.tracer.recordAnnotation(new Annotation.ServerRecv());
    this.tracer.recordAnnotation(new Annotation.LocalAddr({host: this.host, port: this.port}));

    return id;
  }

  recordResponse(id, statusCode, error) {
    this.tracer.setId(id);
    this.tracer.recordBinary('http.status_code', statusCode.toString());
    if (error) {
      this.tracer.recordBinary('error', error.toString());
    } else if (statusCode < 200 || statusCode > 399) {
      this.tracer.recordBinary('error', statusCode.toString());
    }
    this.tracer.recordAnnotation(new Annotation.ServerSend());
  }
}

module.exports = HttpServerInstrumentation;
