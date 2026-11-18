import express from 'express';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

// Email Transporter
const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
};

const sendApprovalEmail = async (email: string, name: string) => {
  if (!process.env.SMTP_HOST) {
    console.warn('SMTP not configured. Skipping email notification.');
    return;
  }

  const transporter = getTransporter();
  const mailOptions = {
    from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Account Approved - DLCF E-Library',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #059669;">Welcome to DLCF E-Library!</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Great news! Your account has been approved by the administrator.</p>
        <p>You can now log in to access all academic materials and Christian novels in our library.</p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Approval email sent to ${email}`);
  } catch (err: any) {
    if (err.code === 'EAUTH' || err.responseCode === 535) {
      console.error('SMTP Authentication Failed: The username or password was rejected.');
      console.error('TIP: If using Gmail, you MUST use an "App Password", not your regular account password.');
      console.error('Visit: https://myaccount.google.com/apppasswords');
    } else {
      console.error('Failed to send approval email:', err.message);
    }
  }
};

const sendLoginNotification = async (email: string, name: string) => {
  if (!process.env.SMTP_HOST) return;
  const transporter = getTransporter();
  const mailOptions = {
    from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'New Login Detected - DLCF E-Library',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #1e293b;">New Login Notification</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>This is to inform you that a new login was detected on your DLCF E-Library account at ${new Date().toLocaleString()}.</p>
        <p>If this wasn't you, please contact the administrator immediately.</p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
        </div>
      </div>
    `,
  };
  try { 
    await transporter.sendMail(mailOptions);
    console.log(`Login notification sent to ${email}`);
  } catch (err: any) { 
    console.error('Login notification failed:', err.message); 
  }
};

const sendWelcomeEmail = async (email: string, name: string) => {
  if (!process.env.SMTP_HOST) return;
  const transporter = getTransporter();
  const mailOptions = {
    from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Welcome to DLCF E-Library - Pending Approval',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #059669;">Welcome, ${name}!</h2>
        <p>Thank you for registering with the DLCF E-Library.</p>
        <p>Your account has been successfully created and is currently <strong>pending approval</strong> by our administrator.</p>
        <p>You will receive another email once your account has been approved and is ready for use.</p>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
        </div>
      </div>
    `,
  };
  try { 
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
  } catch (err: any) { 
    console.error('Welcome email failed:', err.message); 
  }
};

// Lazy Supabase Client Initialization (Requires Vercel redeployment after adding SUPABASE_SERVICE_ROLE_KEY)
let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error('[Supabase] CRITICAL: SUPABASE_URL or SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY is missing.');
      throw new Error('SUPABASE_URL and either SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY are required.');
    }
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

function getFallbackCover(
  courseCode?: string,
  title?: string,
  category?: string,
  department?: string
): string {
  const isNovel = category === 'Christian Novel';
  const code = (courseCode || (isNovel ? 'NOVEL' : 'DLCF')).toUpperCase().trim();
  const rawTitle = title || (isNovel ? 'Christian Novel' : 'Course Material');
  const cleanTitle = rawTitle.replace(/[<>&"]/g, '');
  const cleanDept = (department || (isNovel ? 'Inspirational' : 'Higher Learning')).replace(/[<>&"]/g, '');

  const primaryGrad1 = isNovel ? '#854d0e' : '#047857';
  const primaryGrad2 = isNovel ? '#451a03' : '#064e3b';
  const accentColor = isNovel ? '#fde047' : '#34d399';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryGrad1}" />
        <stop offset="100%" stop-color="${primaryGrad2}" />
      </linearGradient>
      <pattern id="pat" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="400" height="600" fill="url(#g)" />
    <rect width="400" height="600" fill="url(#pat)" />
    <rect x="0" y="0" width="24" height="600" fill="rgba(0,0,0,0.3)" />
    <line x1="24" y1="0" x2="24" y2="600" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
    <rect x="42" y="32" width="326" height="536" rx="10" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    <rect x="48" y="38" width="314" height="524" rx="8" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    <rect x="65" y="55" width="125" height="26" rx="13" fill="rgba(255,255,255,0.15)" />
    <text x="127" y="72" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="10" font-weight="700" fill="${accentColor}" text-anchor="middle" letter-spacing="1">DLCF LIBRARY</text>
    <rect x="65" y="150" width="280" height="100" rx="16" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
    <text x="205" y="212" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">${code.slice(0, 10)}</text>
    <text x="205" y="295" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">
      <tspan x="205" dy="0">${cleanTitle.slice(0, 24)}</tspan>
      ${cleanTitle.length > 24 ? `<tspan x="205" dy="24">${cleanTitle.slice(24, 48)}</tspan>` : ''}
    </text>
    <line x1="65" y1="480" x2="345" y2="480" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    <text x="205" y="515" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.8)" text-anchor="middle">${cleanDept.slice(0, 34)}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const app = express();

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

  // --- API Routes ---

  // Global API Error Handler
  const apiErrorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  };

  // Auth - Login
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const supabase = getSupabase();

      // 1. Authenticate with Supabase Auth (supports users whose passwords were reset via Supabase Auth)
      let authUser: any = null;
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (!authError && authData?.user) {
          authUser = authData.user;
        }
      } catch (authErr) {
        console.warn('[Login] Supabase Auth sign-in attempt notice:', authErr);
      }

      // 2. Fetch profile from public.users table
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (!user && !authUser) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      let passwordValid = false;

      if (authUser) {
        // Authenticated with Supabase Auth! Sync hashed password to public.users table
        passwordValid = true;
        try {
          const hashedPassword = await bcrypt.hash(password, 10);
          await supabase.from('users').update({ password: hashedPassword }).eq('email', email);
          console.log(`[Login] Synced new bcrypt password for ${email}`);
        } catch (syncErr) {
          console.warn('[Login] Password sync notice:', syncErr);
        }
      } else if (user) {
        // Fallback: check bcrypt or legacy plaintext in public.users table
        try {
          if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
            passwordValid = await bcrypt.compare(password, user.password);
          } else {
            passwordValid = (password === user.password);
            if (passwordValid) {
              const hashedPassword = await bcrypt.hash(password, 10);
              await supabase.from('users').update({ password: hashedPassword }).eq('email', email);
            }
          }
        } catch (cmpErr) {
          passwordValid = (password === user.password);
        }
      }

      if (!passwordValid) {
        console.warn('[Login Failure]: Password mismatch for email:', email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const activeUser = user || {
        id: authUser.id,
        email: authUser.email,
        name: authUser.user_metadata?.name || email.split('@')[0],
        is_approved: true,
        is_admin: false,
        is_super_admin: false,
      };

      if (!activeUser.is_approved && !activeUser.is_admin) {
        return res.status(403).json({ 
          error: 'Access Revoked', 
          message: 'Your access to the DLCF E-Library has been revoked by the administrator. Please contact the admin team if you believe this is an error.' 
        });
      }

      // Send login notification (async)
      sendLoginNotification(activeUser.email, activeUser.name);

      res.json({ user: { 
        id: activeUser.id, 
        email: activeUser.email, 
        name: activeUser.name, 
        isAdmin: !!activeUser.is_admin,
        isSuperAdmin: !!activeUser.is_super_admin,
        role: activeUser.role || (activeUser.is_super_admin ? 'super_admin' : activeUser.is_admin ? 'general_admin' : 'member')
      } });
    } catch (err: any) {
      console.error('[Login Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Auth - Logout
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const { userId } = req.body;
      
      if (userId) {
        console.log(`[Auth] User ${userId} logged out at ${new Date().toISOString()}`);
        // You can optionally add session invalidation logic here
        // For example, if you store sessions in a table:
        // const supabase = getSupabase();
        // await supabase.from('sessions').delete().eq('user_id', userId);
      }
      
      res.json({ 
        success: true, 
        message: 'Logged out successfully' 
      });
    } catch (err: any) {
      console.error('[Auth] Logout error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name, token } = req.body;
    
    try {
      const supabase = getSupabase();
      
      // Validate token
      const { data: link, error: linkError } = await supabase
        .from('registration_links')
        .select('*')
        .eq('token', token)
        .single();

      if (linkError || !link) {
        return res.status(400).json({ error: 'Invalid registration link' });
      }

      // Hash the password securely with bcryptjs (10 salt rounds)
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user (Automatically approved)
      const { error: regError } = await supabase
        .from('users')
        .insert([{ id: uuidv4(), email, password: hashedPassword, name, is_approved: true, is_admin: false }]);
      
      if (regError) throw regError;

      // Send welcome email (async)
      sendWelcomeEmail(email, name);
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Registration failed' });
    }
  });

  // Client Auth Configuration endpoint
  app.get('/api/auth/config', (req, res) => {
    res.json({
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    });
  });

  // Supabase Auth Password Reset Request
  app.post('/api/auth/forgot-password', async (req, res) => {
    const { email, redirectTo } = req.body;
    console.log(`[Auth] Forgot password request for: ${email}`);
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    try {
      const supabase = getSupabase();
      const hostOrigin = req.headers.origin || 'https://dlcf-el.nxrlabz.com.ng';
      const targetRedirect = redirectTo || `${hostOrigin}/#reset-password`;
      console.log(`[Auth] Requesting resetPasswordForEmail via Supabase Auth for ${email} with redirect: ${targetRedirect}`);

      const { error: supabaseError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: targetRedirect,
      });

      if (supabaseError) {
        console.error('[Auth] Supabase resetPasswordForEmail error:', supabaseError.message);
        return res.status(400).json({ error: supabaseError.message || 'Could not send recovery email' });
      }

      console.log(`[Auth] Recovery email sent successfully via Supabase Auth to: ${email}`);
      return res.json({ 
        success: true, 
        message: 'Password recovery email sent! Please check your email inbox.' 
      });
    } catch (err: any) {
      console.error(`[Auth] Forgot password exception for ${email}:`, err);
      return res.status(500).json({ error: err.message || 'Server error processing password recovery' });
    }
  });

  // Password Reset Completion (Synchronizes hashed password to database)
  app.post('/api/auth/reset-password', async (req, res) => {
    const { email, password, accessToken } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
      const supabase = getSupabase();
      let targetEmail = email;

      if (accessToken) {
        try {
          const { data: authData } = await supabase.auth.getUser(accessToken);
          if (authData?.user?.email) {
            targetEmail = authData.user.email;
          }
        } catch (e) {
          console.warn('[Auth] Token verification note:', e);
        }
      }

      if (targetEmail) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await supabase
          .from('users')
          .update({ password: hashedPassword })
          .eq('email', targetEmail);
        console.log(`[Auth] Synchronized new password for user: ${targetEmail}`);
      }

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (err: any) {
      console.error('[Auth] Reset password completion error:', err);
      res.status(500).json({ error: err.message || 'Error updating password' });
    }
  });

  app.post('/api/user/profile', async (req, res) => {
    const { userId, email, password, name } = req.body;
    try {
      const supabase = getSupabase();
      
      // Check if email is already taken by another user
      if (email) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .neq('id', userId)
          .single();
        
        if (existingUser) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      const updates: any = {};
      if (email) updates.email = email;
      if (password) updates.password = password;
      if (name) updates.name = name;

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      res.json({ user: { 
        id: data.id, 
        email: data.email, 
        name: data.name, 
        isAdmin: !!data.is_admin,
        isSuperAdmin: !!data.is_super_admin
      } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
      const supabase = getSupabase();
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !user) return res.status(404).json({ error: 'User not found' });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: !!user.is_admin,
          isSuperAdmin: !!user.is_super_admin,
          role: user.role || (user.is_super_admin ? 'super_admin' : user.is_admin ? 'general_admin' : 'member')
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin
  app.get('/api/admin/users', async (req, res) => {
    // Require a requester ID so unauthenticated requests are rejected
    const requesterId = req.query.requesterId as string | undefined;

    try {
      const supabase = getSupabase();

      // If a requesterId was supplied, verify the caller is an admin
      if (requesterId) {
        const { data: requester } = await supabase
          .from('users')
          .select('is_admin, is_super_admin')
          .eq('id', requesterId)
          .single();
        if (!requester || (!requester.is_admin && !requester.is_super_admin)) {
          return res.status(403).json({ error: 'Access denied. Admin rights required.' });
        }
      }

      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[/api/admin/users] Supabase error:', error.message, error.code);
        throw error;
      }

      // Guard against null — Supabase returns null data when RLS blocks the query
      if (!users) {
        console.error('[/api/admin/users] Supabase returned null — check that SUPABASE_SERVICE_ROLE_KEY is set and RLS is bypassed on the backend.');
        return res.status(500).json({ error: 'Database returned no data. Ensure SUPABASE_SERVICE_ROLE_KEY is set on the server.' });
      }

      res.json(users);
    } catch (err: any) {
      console.error('[/api/admin/users] Unexpected error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/demote-self', async (req, res) => {
    const { userId } = req.body;
    try {
      const supabase = getSupabase();
      
      // Get user info
      const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      // If superadmin, check if they are the last one
      if (user.is_super_admin) {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_super_admin', true);
        
        if (count && count <= 1) {
          return res.status(400).json({ error: 'You are the only Super Administrator. You must promote someone else to Super Administrator before you can demote yourself.' });
        }
      }

      const { error } = await supabase
        .from('users')
        .update({ is_admin: false, is_super_admin: false })
        .eq('id', userId);
      
      if (error) throw error;

      // Send notification
      if (user && process.env.SMTP_HOST) {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'Admin Rights Revoked - DLCF E-Library',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #f43f5e;">Admin Rights Revoked</h2>
              <p>Hello <strong>${user.name}</strong>,</p>
              <p>This is to confirm that you have successfully revoked your own administrative rights. You are now a standard user.</p>
              <p>If you need admin access again, please contact another administrator.</p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
              </div>
            </div>
          `
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/demote-admin', async (req, res) => {
    const { userId, requesterId } = req.body;
    try {
      const supabase = getSupabase();
      
      // Verify requester is superadmin
      const { data: requester, error: reqError } = await supabase.from('users').select('*').eq('id', requesterId).single();
      
      if (reqError || !requester) {
        return res.status(403).json({ error: 'Authentication failed. Please log out and log back in.' });
      }

      if (requester.is_super_admin !== true) {
        return res.status(403).json({ error: 'Access denied. Only Super Administrators can demote other admins.' });
      }

      // Get user info for email
      const { data: user } = await supabase.from('users').select('email, name').eq('id', userId).single();

      const { error } = await supabase
        .from('users')
        .update({ is_admin: false, is_super_admin: false })
        .eq('id', userId);
      
      if (error) throw error;

      // Send notification
      if (user && process.env.SMTP_HOST) {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'Admin Rights Revoked - DLCF E-Library',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #f43f5e;">Admin Rights Revoked</h2>
              <p>Hello <strong>${user.name}</strong>,</p>
              <p>This is to inform you that your administrative rights have been revoked by a Super Administrator.</p>
              <p>You are now a standard user. If you believe this is an error, please contact the Super Admin team.</p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
              </div>
            </div>
          `
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/promote-superadmin', async (req, res) => {
    const { userId, requesterId } = req.body;
    try {
      const supabase = getSupabase();
      
      // Verify requester is superadmin
      const { data: requester, error: reqError } = await supabase.from('users').select('*').eq('id', requesterId).single();
      
      if (reqError || !requester) {
        return res.status(403).json({ error: 'Authentication failed. Please log out and log back in.' });
      }

      if (requester.is_super_admin !== true) {
        return res.status(403).json({ error: 'Access denied. Only Super Administrators can promote others to superadmin.' });
      }

      // Get user info
      const { data: user } = await supabase.from('users').select('email, name').eq('id', userId).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { error } = await supabase
        .from('users')
        .update({ is_super_admin: true, is_admin: true, is_approved: true })
        .eq('id', userId);
      
      if (error) throw error;

      // Send notification
      if (process.env.SMTP_HOST) {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'You have been promoted to Super Admin - DLCF E-Library',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #d97706;">Super Admin Promotion</h2>
              <p>Hello <strong>${user.name}</strong>,</p>
              <p>You have been promoted to a <strong>Super Administrator</strong> for the DLCF E-Library.</p>
              <p>You now have the highest level of administrative privileges, including the ability to manage other administrators.</p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
              </div>
            </div>
          `
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/promote-user', async (req, res) => {
    const { userId } = req.body;
    try {
      const supabase = getSupabase();
      
      // Get user info
      const { data: user } = await supabase.from('users').select('email, name').eq('id', userId).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { error } = await supabase
        .from('users')
        .update({ is_admin: true, is_approved: true })
        .eq('id', userId);
      
      if (error) throw error;

      // Send notification
      if (process.env.SMTP_HOST) {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"DLCF E-Library" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'You have been promoted to Admin - DLCF E-Library',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #059669;">Admin Promotion</h2>
              <p>Hello <strong>${user.name}</strong>,</p>
              <p>Congratulations! You have been promoted to an <strong>Administrator</strong> for the DLCF E-Library.</p>
              <p>You now have access to the Admin Dashboard where you can manage books, users, and registration links.</p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 14px; color: #64748b;">Best regards,<br>DLCF Admin Team</p>
              </div>
            </div>
          `
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/toggle-user-access', async (req, res) => {
    const { userId, isApproved } = req.body;
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('users')
        .update({ is_approved: isApproved })
        .eq('id', userId);
      
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update user role (quiz_admin, general_admin, super_admin, member)
  app.post('/api/admin/update-role', async (req, res) => {
    const { userId, role, requesterId } = req.body;
    const VALID_ROLES = ['member', 'general_admin', 'quiz_admin', 'super_admin'];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role value.' });
    }
    try {
      const supabase = getSupabase();

      // Verify requester is super_admin
      const { data: requester } = await supabase
        .from('users')
        .select('is_super_admin, role')
        .eq('id', requesterId)
        .single();

      if (!requester || (!requester.is_super_admin && requester.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Only Super Admins can update roles.' });
      }

      // Derive boolean flags from role for backward-compat
      const is_admin = ['general_admin', 'quiz_admin', 'super_admin'].includes(role);
      const is_super_admin = role === 'super_admin';

      const { error } = await supabase
        .from('users')
        .update({ role, is_admin, is_super_admin })
        .eq('id', userId);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  // QUIZ API  — bypasses Supabase Auth (uses service role key)
  // All endpoints identify the user via userId from the request body/query,
  // validated against public.users. Scoring is computed server-side.
  // ════════════════════════════════════════════════════════════════

  /** Scoring helper — mirrors calculate_quiz_score() SQL function */
  function computeQuizScore(isCorrect: boolean, timeTakenSeconds: number, questionType: string): number {
    if (!isCorrect) return 0;
    const basePoints = 100;
    const maxSpeedBonus = 50;
    const speedWindow = 60;
    const multiplier = questionType === 'fill_blank' ? 1.15 : questionType === 'descriptive' ? 1.30 : 1.0;
    const speedBonus = timeTakenSeconds < speedWindow
      ? Math.floor(maxSpeedBonus * (1 - timeTakenSeconds / speedWindow))
      : 0;
    return Math.max(0, Math.floor(basePoints * multiplier + speedBonus));
  }

  /** Returns today's date string in YYYY-MM-DD (UTC) */
  function getTodayUTC(): string {
    return new Date().toISOString().split('T')[0];
  }

  /** Returns current ISO week string e.g. '2026-W46' */
  function getIsoWeek(date: Date = new Date()): string {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    const yr = new Date(firstThursday).getUTCFullYear();
    return `${yr}-W${String(weekNum).padStart(2, '0')}`;
  }

  /**
   * updateStreak — called after a successful quiz submission.
   * Handles consecutive-day tracking and milestone bonuses.
   * Returns the bonus points awarded this call (0 if none).
   */
  async function updateStreak(
    userId: string,
    supabase: ReturnType<typeof getSupabase>
  ): Promise<{ current_streak: number; bonus_awarded: number; bonus_points: number }> {
    const today = getTodayUTC();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const currentWeek = getIsoWeek();

    // Fetch existing streak row
    const { data: existing } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // If already participated today, nothing to update
    if (existing?.last_participation_date === today) {
      return { current_streak: existing.current_streak, bonus_awarded: 0, bonus_points: 0 };
    }

    let newStreak = 1;
    if (existing) {
      newStreak = existing.last_participation_date === yesterdayStr
        ? (existing.current_streak || 0) + 1
        : 1; // streak broken
    }

    const longestStreak = Math.max(newStreak, existing?.longest_streak || 0);
    let bonusPoints = 0;
    let bonusAwarded = 0;

    const streak3Week = existing?.streak_3_awarded_week || null;
    const streak7Week = existing?.streak_7_awarded_week || null;

    // Milestone: 3-day streak
    let new3Week = streak3Week;
    if (newStreak >= 3 && streak3Week !== currentWeek) {
      bonusPoints += 50;
      bonusAwarded += 1;
      new3Week = currentWeek;
    }

    // Milestone: 7-day streak (additional +150 on top of 3-day)
    let new7Week = streak7Week;
    if (newStreak >= 7 && streak7Week !== currentWeek) {
      bonusPoints += 150;
      bonusAwarded += 1;
      new7Week = currentWeek;
    }

    const totalStreakBonus = (existing?.total_streak_bonus_points || 0) + bonusPoints;

    if (existing) {
      await supabase.from('user_streaks').update({
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_participation_date: today,
        total_streak_bonus_points: totalStreakBonus,
        streak_3_awarded_week: new3Week,
        streak_7_awarded_week: new7Week,
      }).eq('user_id', userId);
    } else {
      await supabase.from('user_streaks').insert([{
        user_id: userId,
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_participation_date: today,
        total_streak_bonus_points: totalStreakBonus,
        streak_3_awarded_week: new3Week,
        streak_7_awarded_week: new7Week,
      }]);
    }

    return { current_streak: newStreak, bonus_awarded: bonusAwarded, bonus_points: bonusPoints };
  }

  /**
   * GET /api/quiz/questions
   * Returns TODAY's questions (filtered by date_identifier).
   * Falls back to week_identifier if date_identifier column doesn't exist yet.
   * Omits correct_answer. Includes countdown to midnight + user streak info.
   */
  app.get('/api/quiz/questions', async (req, res) => {
    const { userId } = req.query as { userId?: string };
    try {
      const supabase = getSupabase();
      const today = getTodayUTC();

      // Calculate seconds until midnight UTC (quiz expiry)
      const now = new Date();
      const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const secondsUntilExpiry = Math.floor((midnight.getTime() - now.getTime()) / 1000);

      // Try date_identifier first, fall back to week_identifier
      let questions: any[] = [];
      let usedDateFilter = false;

      const { data: byDate, error: dateErr } = await supabase
        .from('quiz_questions')
        .select('id, question_text, question_type, options, week_identifier, date_identifier, created_at')
        .eq('date_identifier', today)
        .order('created_at', { ascending: true });

      if (!dateErr) {
        questions = byDate || [];
        usedDateFilter = true;
      } else {
        // Fallback: week_identifier (old data before migration)
        const isoWeek = getIsoWeek();
        const { data: byWeek, error: weekErr } = await supabase
          .from('quiz_questions')
          .select('id, question_text, question_type, options, week_identifier, created_at')
          .eq('week_identifier', isoWeek)
          .order('created_at', { ascending: true });
        if (weekErr) throw weekErr;
        questions = byWeek || [];
      }

      // Fetch already-attempted IDs for this user (today only)
      let attemptedIds: string[] = [];
      let streakInfo: { current_streak: number; longest_streak: number; total_streak_bonus_points: number } | null = null;

      if (userId) {
        // Attempted today
        const { data: attempts } = await supabase
          .from('quiz_attempts')
          .select('question_id')
          .eq('user_id', userId)
          .in('question_id', questions.map((q: any) => q.id));
        attemptedIds = (attempts || []).map((a: any) => a.question_id);

        // Streak info
        const { data: streak } = await supabase
          .from('user_streaks')
          .select('current_streak, longest_streak, total_streak_bonus_points')
          .eq('user_id', userId)
          .maybeSingle();
        if (streak) streakInfo = streak;
      }

      res.json({
        questions,
        attemptedIds,
        currentDate: today,
        currentWeek: getIsoWeek(),
        expiresAt: midnight.toISOString(),
        secondsUntilExpiry,
        streakInfo,
        usedDateFilter,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/quiz/submit
   * Validates answer server-side, records attempt, updates streak.
   * Returns result + streak_info.
   */
  app.post('/api/quiz/submit', async (req, res) => {
    const { userId, questionId, selectedAnswer, timeTakenSeconds } = req.body;

    if (!userId || !questionId || selectedAnswer === undefined || timeTakenSeconds === undefined) {
      return res.status(400).json({ error: 'Missing required fields: userId, questionId, selectedAnswer, timeTakenSeconds' });
    }

    try {
      const supabase = getSupabase();

      // 1. Validate user exists
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('id, name')
        .eq('id', userId)
        .single();

      if (userErr || !userRow) {
        return res.status(401).json({ error: 'User not found. Please log in again.' });
      }

      // 2. Fetch full question (includes correct_answer & date_identifier)
      const { data: question, error: qErr } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (qErr || !question) {
        return res.status(404).json({ error: 'Question not found.' });
      }

      // 3. Check question is still active today (if date_identifier exists)
      if (question.date_identifier) {
        const today = getTodayUTC();
        if (question.date_identifier < today) {
          return res.status(410).json({ error: 'This question has expired. New questions are available today!' });
        }
        if (question.date_identifier > today) {
          return res.status(400).json({ error: 'This question is not yet available.' });
        }
      }

      // 4. Check for duplicate attempt
      const { data: existing } = await supabase
        .from('quiz_attempts')
        .select('id')
        .eq('user_id', userId)
        .eq('question_id', questionId)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'You have already answered this question.' });
      }

      // 5. Server-side answer validation
      const normalise = (s: string) => s.trim().toLowerCase();
      let isCorrect = false;

      if (question.question_type === 'mcq' || question.question_type === 'fill_blank') {
        isCorrect = normalise(selectedAnswer) === normalise(question.correct_answer);
      } else if (question.question_type === 'descriptive') {
        isCorrect = normalise(selectedAnswer).includes(normalise(question.correct_answer))
          || normalise(selectedAnswer) === normalise(question.correct_answer);
      }

      // 6. Calculate score server-side
      const pointsEarned = computeQuizScore(isCorrect, Number(timeTakenSeconds), question.question_type);

      // 7. Insert attempt
      const { data: attempt, error: insertErr } = await supabase
        .from('quiz_attempts')
        .insert([{
          user_id: userId,
          question_id: questionId,
          selected_answer: selectedAnswer,
          is_correct: isCorrect,
          time_taken_seconds: Number(timeTakenSeconds),
          points_earned: pointsEarned,
        }])
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      // 8. Update streak (non-fatal — don't block response on streak error)
      let streakResult = { current_streak: 0, bonus_awarded: 0, bonus_points: 0 };
      try {
        streakResult = await updateStreak(userId, supabase);
      } catch (streakErr) {
        console.warn('[Streak Update Warning]:', streakErr);
      }

      res.json({
        success: true,
        attempt_id: attempt?.id,
        is_correct: isCorrect,
        points_earned: pointsEarned,
        time_taken_seconds: Number(timeTakenSeconds),
        correct_answer: isCorrect ? null : question.correct_answer,
        streak_info: {
          current_streak: streakResult.current_streak,
          bonus_awarded: streakResult.bonus_awarded > 0,
          bonus_points: streakResult.bonus_points,
          milestone: streakResult.current_streak >= 7
            ? '7-day streak! +150 bonus pts 🔥🔥🔥'
            : streakResult.current_streak >= 3
            ? '3-day streak! +50 bonus pts 🔥'
            : null,
        },
      });
    } catch (err: any) {
      console.error('[Quiz Submit Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/quiz/leaderboard
   * Cumulative all-time points = quiz attempt points + streak bonus points.
   * On Sundays, also returns previousWeekWinner.
   */
  app.get('/api/quiz/leaderboard', async (req, res) => {
    const { limit = '50' } = req.query as { limit?: string };
    try {
      const supabase = getSupabase();

      // Fetch all attempts
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select(`
          user_id,
          is_correct,
          points_earned,
          time_taken_seconds,
          created_at,
          users!inner(name, email)
        `);

      if (error) throw error;

      // Fetch all streak bonuses
      const { data: streaks } = await supabase
        .from('user_streaks')
        .select('user_id, current_streak, longest_streak, total_streak_bonus_points');

      const streakMap = new Map<string, { current_streak: number; longest_streak: number; total_streak_bonus_points: number }>();
      for (const s of (streaks || [])) {
        streakMap.set(s.user_id, s);
      }

      // Aggregate attempt points per user
      type Row = {
        user_id: string; is_correct: boolean; points_earned: number;
        time_taken_seconds: number; created_at: string;
        users: { name: string; email: string };
      };
      const map = new Map<string, {
        user_id: string; user_name: string; email: string;
        quiz_points: number; total_attempts: number; correct_answers: number;
        total_time: number; first_attempt: string;
      }>();

      for (const row of (data as Row[] || [])) {
        const existing = map.get(row.user_id);
        if (existing) {
          existing.quiz_points += row.points_earned;
          existing.total_attempts += 1;
          existing.correct_answers += row.is_correct ? 1 : 0;
          existing.total_time += row.time_taken_seconds;
        } else {
          map.set(row.user_id, {
            user_id: row.user_id,
            user_name: (row.users as any).name || (row.users as any).email.split('@')[0],
            email: (row.users as any).email,
            quiz_points: row.points_earned,
            total_attempts: 1,
            correct_answers: row.is_correct ? 1 : 0,
            total_time: row.time_taken_seconds,
            first_attempt: row.created_at,
          });
        }
      }

      const leaderboard = Array.from(map.values())
        .map((entry) => {
          const streak = streakMap.get(entry.user_id);
          const streakBonus = streak?.total_streak_bonus_points || 0;
          return {
            user_id: entry.user_id,
            user_name: entry.user_name,
            email: entry.email,
            quiz_points: entry.quiz_points,
            streak_bonus_points: streakBonus,
            total_points: entry.quiz_points + streakBonus,
            total_attempts: entry.total_attempts,
            correct_answers: entry.correct_answers,
            current_streak: streak?.current_streak || 0,
            longest_streak: streak?.longest_streak || 0,
            accuracy_rate: entry.total_attempts > 0
              ? Math.round((entry.correct_answers / entry.total_attempts) * 10000) / 100
              : 0,
            total_time_taken_seconds: entry.total_time,
            average_time_seconds: entry.total_attempts > 0
              ? Math.round((entry.total_time / entry.total_attempts) * 100) / 100
              : 0,
          };
        })
        .sort((a, b) => b.total_points - a.total_points || a.total_time_taken_seconds - b.total_time_taken_seconds)
        .slice(0, Number(limit))
        .map((entry, idx) => ({ rank: idx + 1, ...entry }));

      // Sunday: compute previous week's winner
      let previousWeekWinner: { user_name: string; total_points: number; week: string } | null = null;
      const nowUTC = new Date();
      const isSunday = nowUTC.getUTCDay() === 0;

      if (isSunday) {
        // Previous week = Mon–Sun (7 days ending yesterday)
        const sundayEnd = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));
        const mondayStart = new Date(sundayEnd);
        mondayStart.setUTCDate(mondayStart.getUTCDate() - 6);
        const prevWeek = getIsoWeek(mondayStart);

        const { data: prevData } = await supabase
          .from('quiz_attempts')
          .select(`user_id, points_earned, users!inner(name, email)`)
          .gte('created_at', mondayStart.toISOString())
          .lt('created_at', sundayEnd.toISOString());

        if (prevData && prevData.length > 0) {
          const prevMap = new Map<string, { user_name: string; total: number }>();
          for (const r of (prevData as any[])) {
            const existing = prevMap.get(r.user_id);
            const name = r.users?.name || r.users?.email?.split('@')[0] || 'Unknown';
            if (existing) {
              existing.total += r.points_earned;
            } else {
              prevMap.set(r.user_id, { user_name: name, total: r.points_earned });
            }
          }
          const winner = Array.from(prevMap.values()).sort((a, b) => b.total - a.total)[0];
          if (winner) {
            previousWeekWinner = { user_name: winner.user_name, total_points: winner.total, week: prevWeek };
          }
        }
      }

      res.json({ leaderboard, previousWeekWinner, isSunday });
    } catch (err: any) {
      console.error('[Leaderboard Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/quiz/my-attempts — returns the user's attempt history */
  app.get('/api/quiz/my-attempts', async (req, res) => {
    const { userId } = req.query as { userId?: string };
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('question_id, is_correct, points_earned, time_taken_seconds, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ attempts: data || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/quiz/streak/:userId — returns a user's streak data */
  app.get('/api/quiz/streak/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      res.json({ streak: data || { current_streak: 0, longest_streak: 0, total_streak_bonus_points: 0 } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  // END QUIZ API
  // ════════════════════════════════════════════════════════════════

  app.post('/api/admin/generate-link', async (req, res) => {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 100); // 100 years expiry (effectively permanent)
    
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('registration_links')
        .insert([{ id: uuidv4(), token, expires_at: expiresAt.toISOString() }]);
      
      if (error) throw error;
      res.json({ token });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/admin/links', async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data: links, error } = await supabase
        .from('registration_links')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      res.json(links);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/links/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`[Admin] Attempting to delete link: ${id}`);
    try {
      if (!id) {
        return res.status(400).json({ error: 'Link ID is required' });
      }
      const supabase = getSupabase();
      const { error, count } = await supabase
        .from('registration_links')
        .delete({ count: 'exact' })
        .eq('id', id);
      
      if (error) {
        console.error(`[Admin] Error deleting link ${id}:`, error.message);
        throw error;
      }
      
      console.log(`[Admin] Successfully deleted link: ${id}. Rows affected: ${count}`);
      res.json({ success: true, deleted: count });
    } catch (err: any) {
      console.error(`[Admin] Exception in delete link ${id}:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // Helper to ensure bucket exists and has correct settings
  async function ensureBucket(supabase: any) {
    const bucketName = 'materials';
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = buckets?.find((b: any) => b.name === bucketName);
      
      const bucketOptions = {
        public: true,
        fileSizeLimit: 209715200, // 200MB
      };

      if (!exists) {
        console.log(`Bucket "${bucketName}" not found. Attempting to create...`);
        const { error: createError } = await supabase.storage.createBucket(bucketName, bucketOptions);
        if (createError) {
          console.warn('Could not create bucket automatically:', createError.message);
        }
      } else {
        // Update existing bucket to ensure it has the 200MB limit
        const { error: updateError } = await supabase.storage.updateBucket(bucketName, bucketOptions);
        if (updateError) {
          console.warn('Could not update bucket settings:', updateError.message);
        }
      }
    } catch (e) {
      console.warn('Error checking/ensuring bucket:', e);
    }
  }

  // Helper to insert book with fallback for missing columns
  async function insertBookResilient(supabase: any, bookData: any) {
    // Try full insert first
    const { data, error } = await supabase
      .from('books')
      .insert([bookData])
      .select()
      .single();

    if (!error) return { data, error: null };

    // If error is about missing columns, try fallback
    if (error.message?.includes('Could not find') || error.code === '42703') {
      console.warn('[Supabase] Missing columns detected, falling back to description metadata');
      
      const safeColumns = ['id', 'title', 'category', 'cover_url', 'download_url', 'description', 'created_at'];
      const fallbackData: any = {};
      const metadata: any = {};

      Object.keys(bookData).forEach(key => {
        if (safeColumns.includes(key)) {
          fallbackData[key] = bookData[key];
        } else {
          metadata[key] = bookData[key];
        }
      });

      // Pack metadata into description
      const metaString = `JSON_META:${JSON.stringify(metadata)}`;
      fallbackData.description = fallbackData.description 
        ? `${fallbackData.description}\n\n${metaString}`
        : metaString;

      return await supabase
        .from('books')
        .insert([fallbackData])
        .select()
        .single();
    }

    return { data: null, error };
  }

  // Helper to update book with fallback for missing columns
  async function updateBookResilient(supabase: any, id: string, bookData: any) {
    // Try full update first
    const { data, error } = await supabase
      .from('books')
      .update(bookData)
      .eq('id', id)
      .select();

    if (!error) return { data, error: null };

    // If error is about missing columns, try fallback
    if (error.message?.includes('Could not find') || error.code === '42703') {
      console.warn('[Supabase] Missing columns detected during update, falling back to description metadata');
      
      const safeColumns = ['id', 'title', 'category', 'cover_url', 'download_url', 'description', 'created_at'];
      const fallbackData: any = {};
      const metadata: any = {};

      Object.keys(bookData).forEach(key => {
        if (safeColumns.includes(key)) {
          fallbackData[key] = bookData[key];
        } else {
          metadata[key] = bookData[key];
        }
      });

      // Fetch the existing description first
      const { data: existingBook } = await supabase
        .from('books')
        .select('description')
        .eq('id', id)
        .single();

      let existingMetadata: any = {};
      let cleanDescription = existingBook?.description || '';

      if (cleanDescription.includes('JSON_META:')) {
        const parts = cleanDescription.split('JSON_META:');
        cleanDescription = parts[0].trim();
        try {
          existingMetadata = JSON.parse(parts[1]);
        } catch (e) {}
      }

      // Merge new metadata over existing metadata
      const mergedMetadata = { ...existingMetadata, ...metadata };
      const metaString = `JSON_META:${JSON.stringify(mergedMetadata)}`;
      fallbackData.description = cleanDescription 
        ? `${cleanDescription}\n\n${metaString}`
        : metaString;

      return await supabase
        .from('books')
        .update(fallbackData)
        .eq('id', id)
        .select();
    }

    return { data: null, error };
  }

  // Books & Materials Management (Primary table: course_materials)
  app.get('/api/books', async (req, res) => {
    try {
      const supabase = getSupabase();
      
      // 1. Fetch materials from course_materials table
      const { data: materials, error: matErr } = await supabase
        .from('course_materials')
        .select('*')
        .order('created_at', { ascending: false });

      if (matErr && !matErr.message.includes('relation "course_materials" does not exist')) {
        console.warn('[Books API] Error querying course_materials table:', matErr.message);
      }

      // 2. Format course_materials to match the frontend Book interface
      const normalizedMaterials = (materials || []).map((m: any) => {
        const isNovel = m.category === 'Christian Novel' || m.course_code === 'GENERAL' || !m.course_code;
        const category = isNovel ? 'Christian Novel' : (m.category || 'Academic');
        const courseCode = isNovel ? '' : (m.course_code || '');
        const department = isNovel ? '' : (m.department || '');

        return {
          id: m.id,
          title: m.title,
          author: '',
          category: category,
          department: department,
          level: isNovel ? '' : (m.level || ''),
          course_code: courseCode,
          course_title: m.course_title || m.title,
          material_type: m.material_type || (isNovel ? 'Novel' : 'Course Material'),
          download_url: m.file_url || m.download_url,
          cover_url: m.cover_url || getFallbackCover(courseCode, m.title, category, department),
          description: isNovel ? 'Christian Novel' : (m.description || `Course material for ${courseCode} (${department})`),
          file_name: m.file_name,
          file_size: m.file_size,
          mime_type: m.mime_type,
          created_at: m.created_at
        };
      });

      // 3. Fallback: check legacy books table only if needed
      let legacyBooks: any[] = [];
      try {
        const { data: books, error: booksErr } = await supabase
          .from('books')
          .select('*')
          .order('created_at', { ascending: false });
        if (!booksErr && books && books.length > 0) {
          legacyBooks = books.map((b: any) => {
            const isNovel = b.category === 'Christian Novel';
            const courseCode = isNovel ? '' : (b.course_code || '');
            const department = isNovel ? '' : (b.department || '');
            return {
              ...b,
              cover_url: b.cover_url || getFallbackCover(courseCode, b.title, b.category, department),
              download_url: b.download_url || b.file_url
            };
          });
        }
      } catch (legacyErr) {
        // Safe to ignore if books table was dropped
      }

      // Merge avoiding duplicate download URLs
      const combined = [...normalizedMaterials];
      const seenUrls = new Set(combined.map((b: any) => b.download_url).filter(Boolean));

      for (const b of legacyBooks) {
        if (!seenUrls.has(b.download_url)) {
          combined.push(b);
          seenUrls.add(b.download_url);
        }
      }

      res.json(combined);
    } catch (err: any) {
      console.error('[Books API Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/books', async (req, res) => {
    try {
      const supabase = getSupabase();
      const { title, category, course_code, course_title, department, level, material_type, download_url, cover_url, description, file_name, file_size, mime_type, file_key } = req.body;

      const isNovel = category === 'Christian Novel';
      const cleanCourseCode = isNovel ? '' : (course_code || '');
      const cleanDept = isNovel ? '' : (department || '');
      const cleanLevel = isNovel ? '' : (level || '');

      // Duplicate Check against course_materials
      const { data: existing } = await supabase
        .from('course_materials')
        .select('id')
        .eq('title', title)
        .eq('course_code', cleanCourseCode);

      if (existing && existing.length > 0) {
        return res.status(400).json({ error: 'A material with this title and course code already exists.' });
      }

      const id = uuidv4();
      const cover = cover_url || getFallbackCover(cleanCourseCode, title, category, cleanDept);
      const download = download_url || '';

      const materialData = {
        id,
        title,
        category: category || 'Academic',
        course_code: cleanCourseCode,
        course_title: course_title || title,
        department: cleanDept,
        level: cleanLevel,
        material_type: material_type || (isNovel ? 'Novel' : 'Course Material'),
        file_url: download,
        download_url: download,
        cover_url: cover,
        description: description || '',
        file_name: file_name || '',
        file_size: file_size || null,
        mime_type: mime_type || '',
        file_key: file_key || '',
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('course_materials')
        .insert([materialData])
        .select()
        .single();
      
      if (error) {
        console.warn('[Admin Books] Standard insert into course_materials failed, retrying with core columns:', error.message);
        const coreMaterial = {
          id,
          title,
          category: category || 'Academic',
          course_code: cleanCourseCode,
          department: cleanDept,
          level: cleanLevel,
          material_type: material_type || 'Course Material',
          file_url: download,
          download_url: download,
          file_name: file_name || '',
          file_size: file_size || null,
          mime_type: mime_type || '',
          created_at: new Date().toISOString()
        };
        const fallbackRes = await supabase.from('course_materials').insert([coreMaterial]).select().single();
        if (fallbackRes.error) throw fallbackRes.error;
        return res.json(fallbackRes.data);
      }

      res.json(data);
    } catch (err: any) {
      console.error('[Admin Books Create Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/admin/books/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`[Admin] Attempting to delete material: ${id}`);
    try {
      if (!id) {
        return res.status(400).json({ error: 'Material ID is required' });
      }
      const supabase = getSupabase();
      
      // Delete from course_materials
      const { error, count } = await supabase
        .from('course_materials')
        .delete({ count: 'exact' })
        .eq('id', id);
      
      if (error) {
        console.error(`[Admin] Error deleting course_materials ${id}:`, error.message);
        throw error;
      }

      // Also remove from legacy books table if exists
      try {
        await supabase.from('books').delete().eq('id', id);
      } catch (e) {}
      
      console.log(`[Admin] Successfully deleted material: ${id}. Rows affected: ${count}`);
      res.json({ success: true, deleted: count });
    } catch (err: any) {
      console.error(`[Admin] Exception in delete material ${id}:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/admin/books/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const supabase = getSupabase();
      const updateData: any = {};
      const allowed = ['title', 'category', 'department', 'level', 'course_code', 'course_title', 'material_type', 'description', 'download_url', 'file_url', 'cover_url'];
      for (const key of allowed) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
      }
      if (updateData.download_url && !updateData.file_url) {
        updateData.file_url = updateData.download_url;
      }

      const { error } = await supabase
        .from('course_materials')
        .update(updateData)
        .eq('id', id);
      
      if (error) {
        console.warn('[Admin] Update error on course_materials, retrying with core columns:', error.message);
        const coreCols = ['title', 'category', 'department', 'level', 'course_code', 'material_type', 'file_url', 'download_url'];
        const coreData: any = {};
        for (const k of coreCols) {
          if (updateData[k] !== undefined) coreData[k] = updateData[k];
        }
        const { error: coreErr } = await supabase.from('course_materials').update(coreData).eq('id', id);
        if (coreErr) throw coreErr;
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[Admin Update Material Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Sync storage endpoint (kept as harmless no-op for backwards compatibility)
  app.post('/api/admin/sync-storage', async (req, res) => {
    res.json({
      success: true,
      count: 0,
      message: 'Materials are directly served from course_materials.'
    });
  });

  // File Upload to Supabase Storage
  app.post('/api/admin/upload', upload.single('file'), async (req: any, res) => {
    console.log(`[Upload] Received upload request: ${req.file?.originalname} (${req.file?.size} bytes)`);
    try {
      if (!req.file) {
        console.error('[Upload] No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const supabase = getSupabase();
      await ensureBucket(supabase);
      const bucketName = 'materials';

      const fileName = `${uuidv4()}-${req.file.originalname}`;
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (error) {
        if (error.message.includes('Bucket not found')) {
          throw new Error('The storage bucket "materials" was not found. Please create a PUBLIC bucket named "materials" in your Supabase dashboard under Storage.');
        }
        throw error;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      res.json({ 
        url: publicUrl,
        file_key: fileName,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size
      });
    } catch (err: any) {
      console.error('Upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/admin/mass-upload-gdrive', async (req, res) => {
    let { folderId, department, level, category, courseCode: manualCourseCode, courseTitle: manualCourseTitle, materialType, uploaderId } = req.body;
    const apiKey = process.env.GOOGLE_DRIVE_API_KEY;

    console.log(`[Mass Upload] Starting request for resource: ${folderId}, Course: ${manualCourseCode}, Type: ${materialType}`);

    if (!apiKey) {
      console.error('[Mass Upload] CRITICAL: GOOGLE_DRIVE_API_KEY is missing from environment variables.');
      return res.status(400).json({ error: 'GOOGLE_DRIVE_API_KEY is not configured in the environment. Please check your project secrets.' });
    }

    if (!folderId) {
      return res.status(400).json({ error: 'Folder ID or File ID is required.' });
    }

    let isFolder = true;
    // Extract ID from URL if user pasted a full link
    if (folderId.includes('drive.google.com')) {
      const folderMatch = folderId.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      const fileMatch = folderId.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (folderMatch) {
        folderId = folderMatch[1];
        isFolder = true;
        console.log(`[Mass Upload] Extracted folder ID from URL: ${folderId}`);
      } else if (fileMatch) {
        folderId = fileMatch[1];
        isFolder = false;
        console.log(`[Mass Upload] Extracted file ID from URL: ${folderId}`);
      }
    }

    try {
      const drive = google.drive({ version: 'v3', auth: apiKey });
      const supabase = getSupabase();
      await ensureBucket(supabase);
      const bucketName = 'materials';
      const results = [];
      let files = [];

      if (isFolder) {
        console.log('[Mass Upload] Fetching file list from GDrive folder...');
        // List all files (excluding folders) in the folder
        const response = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
          fields: 'files(id, name, size, mimeType)',
        }).catch(err => {
          console.error('[Mass Upload] GDrive API List Error:', err.message);
          if (err.message.includes('File not found')) {
            throw new Error('Google Drive Folder not found. Please check the ID and ensure the folder is shared as "Public".');
          }
          throw err;
        });
        files = response.data.files || [];
        console.log(`[Mass Upload] Found ${files.length} files in folder`);
      } else {
        console.log('[Mass Upload] Fetching file metadata from GDrive for single file...');
        // Get single file metadata
        const response = await drive.files.get({
          fileId: folderId,
          fields: 'id, name, size, mimeType'
        }).catch(err => {
          console.error('[Mass Upload] GDrive API Get Error:', err.message);
          if (err.message.includes('File not found')) {
            throw new Error('Google Drive File not found. Please check the ID and ensure the file is shared as "Public".');
          }
          throw err;
        });
        files = [response.data];
        console.log(`[Mass Upload] Target file: ${files[0].name}`);
      }

      if (files.length === 0) {
        return res.json({ success: true, message: 'No valid files found.', count: 0 });
      }

      for (const file of files) {
        try {
          // Download from GDrive
          const fileResponse = await drive.files.get(
            { fileId: file.id!, alt: 'media' },
            { responseType: 'arraybuffer' }
          );

          const sanitizedOriginalName = file.name?.replace(/[^a-zA-Z0-9.-]/g, '_');
          const fileName = `${uuidv4()}-${sanitizedOriginalName}`;
          const buffer = Buffer.from(fileResponse.data as ArrayBuffer);

          // Upload to Supabase
          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(fileName, buffer, {
              contentType: file.mimeType || 'application/octet-stream',
              upsert: true
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

          // Create book record
          const courseCode = manualCourseCode || 'GENERAL';
          // If it's a Christian Novel, use filename as title and clear courseCode
          let title = file.name ? file.name.replace(/\.[^/.]+$/, '').trim() : 'Untitled Material';
          let finalCourseCode = courseCode;
          let finalCourseTitle = manualCourseTitle || courseCode;

          if (category === 'Christian Novel') {
            finalCourseCode = ''; 
            finalCourseTitle = '';
          }

          // Duplicate Check against course_materials
          const { data: existingMaterials } = await supabase
            .from('course_materials')
            .select('id')
            .eq('title', title)
            .eq('course_code', finalCourseCode || '');

          if (existingMaterials && existingMaterials.length > 0) {
            console.log(`[Mass Upload] Skipping duplicate: ${title} (${courseCode})`);
            results.push({ name: file.name, status: 'skipped', message: 'Duplicate found' });
            continue;
          }

          // Auto-detect material type for academic materials
          let detectedMaterialType = materialType || 'Course Material';
          if (category === 'Academic Materials') {
            const lowerName = file.name?.toLowerCase() || '';
            if (lowerName.includes('pq') || 
                lowerName.includes('past question') || 
                lowerName.includes('exam') || 
                lowerName.includes('test') || 
                lowerName.includes('quiz')) {
              detectedMaterialType = 'Past Question';
            } else {
              detectedMaterialType = 'Course Material';
            }
          }

          const coverUrl = getFallbackCover(finalCourseCode, title, category, department);
          const materialData = {
            id: uuidv4(),
            title,
            category: category === 'Christian Novel' ? 'Christian Novel' : 'Academic',
            department: department || '',
            level: level || '',
            course_code: finalCourseCode,
            course_title: finalCourseTitle,
            material_type: detectedMaterialType,
            download_url: publicUrl,
            file_url: publicUrl,
            cover_url: coverUrl,
            description: `Mass uploaded from Google Drive: ${file.name}`,
            file_key: fileName,
            file_name: file.name,
            mime_type: file.mimeType || 'application/octet-stream',
            file_size: file.size ? parseInt(file.size, 10) : null,
            uploader_id: uploaderId || null,
            created_at: new Date().toISOString()
          };

          const { error: dbError } = await supabase
            .from('course_materials')
            .insert([materialData]);

          if (dbError) {
            console.warn('[Mass Upload] Primary insert into course_materials failed, trying core fields:', dbError.message);
            const coreData = {
              id: materialData.id,
              title: materialData.title,
              category: materialData.category,
              department: materialData.department,
              level: materialData.level,
              course_code: materialData.course_code,
              material_type: materialData.material_type,
              download_url: publicUrl,
              file_url: publicUrl,
              file_name: file.name,
              file_size: materialData.file_size,
              mime_type: materialData.mime_type,
              created_at: materialData.created_at
            };
            const coreRes = await supabase.from('course_materials').insert([coreData]);
            if (coreRes.error) throw coreRes.error;
          }

          results.push({ name: file.name, status: 'success' });
        } catch (err: any) {
          console.error(`Failed to process file ${file.name}:`, err.message);
          results.push({ name: file.name, status: 'failed', error: err.message });
        }
      }

      res.json({ success: true, results, count: results.filter(r => r.status === 'success').length });
    } catch (err: any) {
      console.error('Mass upload error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Apply API error handler to all /api routes
  app.use('/api', apiErrorHandler);

  // Vite middleware for development (skip on Vercel serverless)
  if (!process.env.VERCEL) {
    (async () => {
      const PORT = parseInt(process.env.PORT || '3000', 10);
      if (process.env.NODE_ENV !== 'production') {
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } else {
        // Serve static files from dist/client
        const clientDistPath = path.join(__dirname, 'client');
        console.log(`[Server] Serving static files from: ${clientDistPath}`);
        
        app.use(express.static(clientDistPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(clientDistPath, 'index.html'));
        });
      }

      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    })();
  }

export default app;