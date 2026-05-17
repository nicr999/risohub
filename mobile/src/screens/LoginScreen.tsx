// ============================================================
// RISO HUB Mobile — src/screens/LoginScreen.tsx
// Handles email/password login + 2FA TOTP verification
// ============================================================

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Alert,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { COLOURS, FONTS } from '../theme';

type Step = 'credentials' | '2fa';

export default function LoginScreen() {
  const { login, verify2FA } = useAuth();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);

    if (result.type === 'error') {
      setError(result.message);
    } else if (result.type === '2fa_required') {
      setPreAuthToken(result.preAuthToken);
      setStep('2fa');
      setTimeout(() => codeRef.current?.focus(), 100);
    }
    // type === 'success' → AuthContext sets user → navigator switches to app
  }

  async function handle2FA() {
    if (code.length !== 6) {
      setError('Please enter your 6-digit code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await verify2FA(preAuthToken, code);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Invalid code — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoMark}>
            <Text style={s.logoText}>RH</Text>
          </View>
          <Text style={s.brandName}>RISO HUB</Text>
          <Text style={s.brandSub}>MCS Compliance Platform</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {step === 'credentials' ? (
            <>
              <Text style={s.cardTitle}>Sign in</Text>

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <View style={s.field}>
                <Text style={s.label}>Email</Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@risohome.co.uk"
                  placeholderTextColor="#bbb"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>

              <View style={s.field}>
                <Text style={s.label}>Password</Text>
                <TextInput
                  ref={passwordRef}
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#bbb"
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>

              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Sign in</Text>
                }
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.cardTitle}>Two-factor authentication</Text>
              <Text style={s.cardDesc}>
                Enter the 6-digit code from your authenticator app.
              </Text>

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              <View style={s.field}>
                <Text style={s.label}>Authentication code</Text>
                <TextInput
                  ref={codeRef}
                  style={[s.input, s.codeInput]}
                  value={code}
                  onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor="#bbb"
                  keyboardType="number-pad"
                  maxLength={6}
                  returnKeyType="done"
                  onSubmitEditing={handle2FA}
                />
              </View>

              <TouchableOpacity
                style={[s.btn, (loading || code.length !== 6) && s.btnDisabled]}
                onPress={handle2FA}
                disabled={loading || code.length !== 6}
                activeOpacity={0.8}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Verify</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setStep('credentials'); setCode(''); setError(''); }}>
                <Text style={s.backLink}>← Back to sign in</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={s.footer}>RISO HOME · MCS Certified Heat Pump Installers</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLOURS.cream },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoMark: {
    width: 60, height: 60, borderRadius: 14,
    backgroundColor: COLOURS.olive, justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 22, fontFamily: FONTS.bold },
  brandName: { fontSize: 20, fontWeight: '700', color: COLOURS.dark, fontFamily: FONTS.bold, letterSpacing: 1 },
  brandSub: { fontSize: 12, color: '#aaa', marginTop: 4, fontFamily: FONTS.regular },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: COLOURS.dark, marginBottom: 4, fontFamily: FONTS.bold },
  cardDesc: { fontSize: 13, color: '#888', marginBottom: 20, lineHeight: 18, fontFamily: FONTS.regular },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: FONTS.bold },
  input: {
    borderWidth: 1, borderColor: '#e0e0d8', borderRadius: 10,
    padding: 12, fontSize: 15, color: COLOURS.dark,
    backgroundColor: '#fafaf8', fontFamily: FONTS.regular,
  },
  codeInput: { fontSize: 24, textAlign: 'center', letterSpacing: 8, fontFamily: FONTS.bold },
  btn: {
    backgroundColor: COLOURS.olive, borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: FONTS.bold },
  errorText: {
    backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 8,
    padding: 10, fontSize: 13, marginBottom: 16, fontFamily: FONTS.regular,
  },
  backLink: { textAlign: 'center', color: '#aaa', marginTop: 16, fontSize: 13, fontFamily: FONTS.regular },
  footer: { textAlign: 'center', color: '#ccc', fontSize: 11, marginTop: 32, fontFamily: FONTS.regular },
});
