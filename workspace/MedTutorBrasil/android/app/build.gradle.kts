plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    // Google services Gradle plugin
    id("com.google.gms.google-services")
}

android {
    namespace = "com.cobraai.project"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.cobraai.project"
        minSdk = 23
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Import the Firebase BoM (Bill of Materials) v34.18.0
    implementation(platform("com.google.firebase:firebase-bom:34.18.0"))

    // Firebase Core & Analytics
    implementation("com.google.firebase:firebase-analytics")

    // Firebase Authentication (Google Sign-In & Email/Password)
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.android.gms:play-services-auth:21.0.0")

    // Cloud Firestore (Offline Persistence & Medical Data Architecture)
    implementation("com.google.firebase:firebase-firestore")

    // Firebase Storage (Clinical Medical Figures & WebP images)
    implementation("com.google.firebase:firebase-storage")

    // AndroidX & Material Design
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
}
