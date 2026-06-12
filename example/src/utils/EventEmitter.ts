import { EventEmitter } from 'eventemitter3';

type Events = {
  serverUnAuthorized: [];
};

const MyEventEmitter = new EventEmitter<Events>();

export default MyEventEmitter;
