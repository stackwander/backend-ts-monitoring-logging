import { User } from '../../ca_domain/entities/user';
import { IUserRepository } from '../../ca_domain/interfaces/IUserRepository'
import { UserRepository } from '../../ca_infrastructure/database/repositories/userrepository';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import redis from '../../ca_infrastructure/database/redis/redis';

dotenv.config();

const ONE_HOUR = 3600; // seconds

export class LoginUsecase 
{
  private userRepository: IUserRepository;

  constructor() 
  {
    this.userRepository = new UserRepository();
  }

  async execute(email: string, password: string): Promise<{ token: string, refreshToken: string } | null> 
  {
    const user:User | null = await this.userRepository.findByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password))) 
        throw new Error('Invalid credentials');

    const token = jwt.sign({ _id: user.userId }, process.env.SECRET_KEY as string, { expiresIn: ONE_HOUR });
    const refreshToken = jwt.sign({ _id: user.userId }, process.env.SECRET_KEY as string, { expiresIn: ONE_HOUR * 24 * 7 });;
    redis.set(`user:${user.userId}`, JSON.stringify(user));

    return { token, refreshToken };
  }

}
