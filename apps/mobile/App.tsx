import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
export default function App(){return <SafeAreaView style={styles.safeArea}><StatusBar style="light"/><View style={styles.container}><Text style={styles.brand}>NOVA CHAT</Text><Text style={styles.subtitle}>Connect. Chat. Share.</Text><Text style={styles.note}>Mobile application skeleton · MVP-01</Text></View></SafeAreaView>;}
const styles=StyleSheet.create({safeArea:{flex:1,backgroundColor:"#080B14"},container:{flex:1,alignItems:"center",justifyContent:"center",padding:24},brand:{color:"#F8FAFC",fontSize:32,fontWeight:"700",letterSpacing:2},subtitle:{color:"#A78BFA",marginTop:12,fontSize:15},note:{color:"#64748B",marginTop:28,fontSize:12}});
