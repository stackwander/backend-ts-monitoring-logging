import express                                 from 'express';
import path                                    from 'path';
import cookieParser                            from 'cookie-parser';
//import logger from 'morgan';
import dotenv                                  from 'dotenv';
import bodyparser                              from 'body-parser';
//security and protecting endpoints
import cors from 'cors';
import { PassportConfig }                      from './ca_infrastructure/authentication/authentication'
import corsOptions                             from './ca_presentation/middleware/security/cors';
import limiter                                 from './ca_presentation/middleware/security/ratelimit';
//logging and monitoring
import { exceptionHandler}                     from './ca_presentation/middleware/errorhandling/errorhandler';
import { metricsEndpoint, metricsMiddleware }  from './ca_presentation/monitoring/prometheus';
import { logRequest }                          from './ca_infrastructure/logging/requestlogger';
//Application end-point routes
import productroutes                           from './ca_presentation/routes/productroutes';
import customerroutes                          from './ca_presentation/routes/customerroutes';
import orderroutes                             from './ca_presentation/routes/orderroutes';
import userroutes                              from './ca_presentation/routes/userroutes';

//loading environment variables from .env file
dotenv.config();

//Creating express app
const app = express();

// Observe failures from parsing and rate limiting as well as controller responses.
app.use(metricsMiddleware);
app.use(logRequest);
// Scrapes remain available even when the API rate limit is exhausted.
app.get('/metrics', metricsEndpoint);

//Securing endpoints using passport authenticator
const passportConfig = new PassportConfig();
app.use(passportConfig.initialize());

//Adding the middleware 
//app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyparser.json());
app.use(cookieParser());
app.use(cors(corsOptions)); 
app.use('/api', limiter);

//Routes
app.use('/api/product', productroutes);
app.use('/api/customer', customerroutes);
app.use('/api/order', orderroutes);
app.use('/api/user', userroutes);

app.use(express.static(path.join(__dirname, 'public')));

//Global Exception handler 
app.use(exceptionHandler);

export default app; //to create server in www.ts
