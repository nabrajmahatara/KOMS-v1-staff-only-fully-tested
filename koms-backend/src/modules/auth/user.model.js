import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ROLE_VALUES, ROLES } from '../../constants/roles.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'at least 3 characters required'],
    },
    email: {
      type: String,
      required: [true, 'email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'password is required'],
      minlength: [8, 'at least 8 characters required'],
      select: false,
    },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.WAITER, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Modernized async pre-save hook (removed 'next' callback)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  this.password = await bcrypt.hash(this.password, 10);
});

// MongoDB enforces the bootstrap invariant even when registrations arrive
// concurrently. The partial filter leaves all non-owner roles unrestricted.
userSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: ROLES.OWNER } }
);

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model('User', userSchema);
