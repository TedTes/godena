import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image } from 'react-native';
import { Button } from '../components/ui/Button';

interface WelcomeScreenProps {
  navigation: any;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Godena</Text>
          <Text style={styles.subtitle}>
            Connect with the Habesha community worldwide
          </Text>
        </View>

        <View style={styles.features}>
          <Text style={styles.featureText}>🤝 Find meaningful connections</Text>
          <Text style={styles.featureText}>🎉 Discover cultural events</Text>
          <Text style={styles.featureText}>💼 Network professionally</Text>
          <Text style={styles.featureText}>🌍 Connect globally</Text>
        </View>

        <View style={styles.buttons}>
          <Button
            title="Get Started"
            onPress={() => navigation.navigate('Register')}
            style={styles.primaryButton}
          />
          <Button
            title="Already have an account? Sign In"
            onPress={() => navigation.navigate('Login')}
            variant="outline"
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  features: {
    marginBottom: 48,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    marginBottom: 12,
  },
});

export default WelcomeScreen;