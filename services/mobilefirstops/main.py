#!/usr/bin/env python3
"""
MobileFirstOps Agent - React Native/Flutter Mobile Development Specialist
Specialized agent for mobile app development, cross-platform solutions, and mobile-first architectures
"""

import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from llm_provider import LLMProvider, LLMRequest, get_llm_provider
from pydantic import BaseModel


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Disable uvicorn default access log formatting if it exists
logging.getLogger("uvicorn.access").handlers = []


# --- Pydantic Models (ADR-012 Compliant) ---


class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None
    llm_configured: bool = False
    llm_cost_usd: Optional[float] = None


class CapabilitiesResponse(BaseModel):
    agent_id: str = "mobilefirstops"
    agent_type: str = "framework_specialist"
    task_type: str = "MOBILE_DEVELOPMENT"
    capabilities: List[str] = [
        "create_react_native_app",
        "create_flutter_app",
        "generate_mobile_components",
        "implement_navigation",
        "setup_state_management",
        "configure_push_notifications",
        "implement_offline_sync",
        "optimize_mobile_performance",
        "setup_mobile_auth",
        "create_responsive_layouts",
        "implement_native_modules",
        "setup_app_store_deployment",
    ]


class TaskParameters(BaseModel):
    app_name: str
    platform: str = (
        "cross_platform"  # react_native, flutter, ios, android, cross_platform
    )
    target_platforms: List[str] = ["ios", "android"]
    ui_framework: Optional[str] = "default"
    state_management: Optional[str] = "redux"  # redux, mobx, zustand, provider, bloc
    navigation_type: Optional[str] = "stack"  # stack, tab, drawer
    auth_method: Optional[str] = "firebase"
    backend_integration: Optional[str] = "rest"
    offline_support: bool = False
    push_notifications: bool = False
    performance_requirements: Optional[Dict[str, Any]] = None
    design_system: Optional[Dict[str, Any]] = None


class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None


class TaskResultMetrics(BaseModel):
    processing_time_ms: float
    components_generated: int
    screens_created: int
    native_modules: int


class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics


# --- FastAPI App ---

AGENT_BEARER = os.getenv("AGENT_BEARER")


async def verify_orchestrator(request: Request):
    if not AGENT_BEARER:
        return True
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    if token != AGENT_BEARER:
        raise HTTPException(status_code=403, detail="Invalid token")
    return True


app = FastAPI(
    title="MobileFirstOps Agent",
    description="React Native/Flutter Mobile Development Specialist",
    version="2.0.0",
)

# Global LLM provider instance
_llm: Optional[LLMProvider] = None


async def get_llm() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = await get_llm_provider()
    return _llm


@app.get("/llm-metrics")
async def llm_metrics(_: bool = Depends(verify_orchestrator)):
    """Return LLM usage metrics for monitoring."""
    try:
        llm = await get_llm()
        return {
            "status": "ok",
            "cost_today_usd": llm.get_cost_today(),
            "provider_health": {
                name: health.model_dump()
                for name, health in llm.get_provider_health().items()
            },
            "rate_limits": llm.get_rate_limit_status(),
        }
    except Exception as e:
        return {"error": str(e), "status": "llm_not_initialized"}


# --- Agent Logic ---


async def _create_react_native_app(params: TaskParameters) -> Dict[str, Any]:
    """Generate complete React Native app structure"""

    llm = await get_llm()

    prompt = f"""
    Generate a complete React Native app structure for project: {params.app_name}
    State Management: {params.state_management}
    Navigation: {params.navigation_type}
    Auth: {params.auth_method}

    Return a JSON object with the following structure:
    {{
        "package.json": "content",
        "App.js": "content",
        "index.js": "content",
        "src/": {{
            "components/": {{"Button.js": "content"}},
            "screens/": {{"HomeScreen.js": "content"}},
            "navigation/": {{"AppNavigator.js": "content"}},
            "services/": {{"api.js": "content"}},
            "store/": {{"index.js": "content"}},
            "utils/": {{"helpers.js": "content"}},
            "hooks/": {{"useAuth.js": "content"}},
            "assets/": {{}}
        }},
        "android/": {{}},
        "ios/": {{}},
        "metro.config.js": "content",
        "babel.config.js": "content",
        ".eslintrc.js": "content",
        "README.md": "content"
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert React Native developer.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        project_structure = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        project_structure = {"error": "Failed to parse LLM response"}

    return {
        "app_name": params.app_name,
        "platform": "react_native",
        "structure": project_structure,
        "setup_instructions": _generate_rn_setup_instructions(params),
        "deployment_guide": _generate_rn_deployment_guide(params),
        "performance_optimizations": _get_rn_performance_tips(),
        "best_practices": _get_rn_best_practices(),
        "llm_provider": response.provider,
        "llm_model": response.model,
        "cost_usd": response.cost_usd,
    }


async def _create_flutter_app(params: TaskParameters) -> Dict[str, Any]:
    """Generate complete Flutter app structure"""

    llm = await get_llm()

    prompt = f"""
    Generate a complete Flutter app structure for project: {params.app_name}
    State Management: {params.state_management}
    Auth: {params.auth_method}

    Return a JSON object with the following structure:
    {{
        "pubspec.yaml": "content",
        "lib/": {{
            "main.dart": "content",
            "app/": {{"app.dart": "content"}},
            "features/": {{}},
            "shared/": {{}},
            "core/": {{}}
        }},
        "android/": {{}},
        "ios/": {{}},
        "test/": {{}},
        "assets/": {{}},
        "README.md": "content"
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert Flutter developer.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        project_structure = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        project_structure = {"error": "Failed to parse LLM response"}

    return {
        "app_name": params.app_name,
        "platform": "flutter",
        "structure": project_structure,
        "setup_instructions": _generate_flutter_setup_instructions(params),
        "deployment_guide": _generate_flutter_deployment_guide(params),
        "performance_optimizations": _get_flutter_performance_tips(),
        "best_practices": _get_flutter_best_practices(),
        "llm_provider": response.provider,
        "llm_model": response.model,
        "cost_usd": response.cost_usd,
    }


async def _generate_mobile_components(params: TaskParameters) -> Dict[str, Any]:
    """Generate reusable mobile UI components"""

    llm = await get_llm()

    prompt = f"""
    Generate reusable mobile UI components for project: {params.app_name}
    Platform: {params.platform}
    UI Framework: {params.ui_framework}

    Return a JSON object with the following structure:
    {{
        "components": {{"Button": "content", "Input": "content"}},
        "design_tokens": {{"colors": {{}}, "typography": {{}}}},
        "theme_configuration": "description",
        "accessibility_guidelines": ["guideline 1"],
        "testing_strategies": ["strategy 1"]
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert mobile UI developer.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        result = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        result = {"error": "Failed to parse LLM response"}

    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["cost_usd"] = response.cost_usd
    return result


async def _setup_state_management(params: TaskParameters) -> Dict[str, Any]:
    """Setup state management solution"""

    llm = await get_llm()

    prompt = f"""
    Setup state management solution for project: {params.app_name}
    Platform: {params.platform}
    State Management: {params.state_management}
    Offline Support: {params.offline_support}

    Return a JSON object with the following structure:
    {{
        "state_management": {{"store.js": "content"}},
        "data_flow_patterns": "description",
        "caching_strategies": "description",
        "offline_sync": "description"
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert mobile state management architect.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        result = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}")
        result = {"error": "Failed to parse LLM response"}

    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["cost_usd"] = response.cost_usd
    return result


def _generate_rn_package_json(params: TaskParameters) -> str:
    """Generate React Native package.json"""

    dependencies = {
        "react": "18.2.0",
        "react-native": "0.72.6",
        "@react-navigation/native": "^6.1.9",
        "@react-navigation/stack": "^6.3.20",
        "react-native-screens": "^3.27.0",
        "react-native-safe-area-context": "^4.7.4",
    }

    dev_dependencies = {
        "@babel/core": "^7.20.0",
        "@babel/preset-env": "^7.20.0",
        "@babel/runtime": "^7.20.0",
        "@react-native/eslint-config": "^0.72.2",
        "@react-native/metro-config": "^0.72.11",
        "@tsconfig/react-native": "^3.0.0",
        "@types/react": "^18.0.24",
        "@types/react-test-renderer": "^18.0.0",
        "babel-jest": "^29.2.1",
        "eslint": "^8.19.0",
        "jest": "^29.2.1",
        "metro-react-native-babel-preset": "0.76.8",
        "prettier": "^2.4.1",
        "react-test-renderer": "18.2.0",
        "typescript": "4.8.4",
    }

    # Add state management dependencies
    if params.state_management == "redux":
        dependencies["@reduxjs/toolkit"] = "^1.9.7"
        dependencies["react-redux"] = "^8.1.3"
    elif params.state_management == "zustand":
        dependencies["zustand"] = "^4.4.4"

    # Add navigation dependencies
    if params.navigation_type == "tab":
        dependencies["@react-navigation/bottom-tabs"] = "^6.5.11"
    elif params.navigation_type == "drawer":
        dependencies["@react-navigation/drawer"] = "^6.6.6"

    # Add auth dependencies
    if params.auth_method == "firebase":
        dependencies["@react-native-firebase/app"] = "^18.6.1"
        dependencies["@react-native-firebase/auth"] = "^18.6.1"

    # Add push notifications
    if params.push_notifications:
        dependencies["@react-native-firebase/messaging"] = "^18.6.1"
        dependencies["react-native-push-notification"] = "^10.1.1"

    package_json = {
        "name": params.app_name.lower().replace(" ", "_"),
        "version": "0.0.1",
        "private": True,
        "scripts": {
            "android": "react-native run-android",
            "ios": "react-native run-ios",
            "lint": "eslint .",
            "start": "react-native start",
            "test": "jest",
            "build:android": "cd android && ./gradlew assembleRelease",
            "build:ios": "react-native run-ios --configuration Release",
        },
        "dependencies": dependencies,
        "devDependencies": dev_dependencies,
        "jest": {"preset": "react-native"},
    }

    import json

    return json.dumps(package_json, indent=2)


def _generate_rn_app_js(params: TaskParameters) -> str:
    """Generate main App.js file for React Native"""

    return f"""/**
 * {params.app_name} - React Native App
 * Generated by Constella MobileFirstOps Agent
 */

import React from 'react';
import {{NavigationContainer}} from '@react-navigation/native';
import {{Provider}} from 'react-redux';
import {{SafeAreaProvider}} from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import {{store}} from './src/store';
import {{ThemeProvider}} from './src/components/ThemeProvider';

const App = () => {{
  return (
    <Provider store={{store}}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </SafeAreaProvider>
    </Provider>
  );
}};

export default App;
"""


def _generate_flutter_pubspec(params: TaskParameters) -> str:
    """Generate Flutter pubspec.yaml"""

    dependencies = {"flutter": {"sdk": "flutter"}, "cupertino_icons": "^1.0.2"}

    # Add state management dependencies
    if params.state_management == "bloc":
        dependencies["flutter_bloc"] = "^8.1.3"
        dependencies["bloc"] = "^8.1.2"
    elif params.state_management == "provider":
        dependencies["provider"] = "^6.1.1"
    elif params.state_management == "riverpod":
        dependencies["flutter_riverpod"] = "^2.4.9"

    # Add navigation
    dependencies["go_router"] = "^12.1.1"

    # Add auth
    if params.auth_method == "firebase":
        dependencies["firebase_core"] = "^2.24.2"
        dependencies["firebase_auth"] = "^4.15.3"

    # Add push notifications
    if params.push_notifications:
        dependencies["firebase_messaging"] = "^14.7.10"

    dev_dependencies = {"flutter_test": {"sdk": "flutter"}, "flutter_lints": "^3.0.0"}

    pubspec_content = f'''name: {params.app_name.lower().replace(" ", "_")}
description: "{params.app_name} - Flutter Mobile App"
publish_to: 'none'

version: 1.0.0+1

environment:
  sdk: '>=3.1.5 <4.0.0'

dependencies:
'''

    for dep, version in dependencies.items():
        if isinstance(version, dict):
            pubspec_content += f"  {dep}:\n"
            for key, val in version.items():
                pubspec_content += f"    {key}: {val}\n"
        else:
            pubspec_content += f"  {dep}: {version}\n"

    pubspec_content += "\ndev_dependencies:\n"

    for dep, version in dev_dependencies.items():
        if isinstance(version, dict):
            pubspec_content += f"  {dep}:\n"
            for key, val in version.items():
                pubspec_content += f"    {key}: {val}\n"
        else:
            pubspec_content += f"  {dep}: {version}\n"

    pubspec_content += """
flutter:
  uses-material-design: true

  assets:
    - assets/images/
    - assets/icons/

  fonts:
    - family: CustomFont
      fonts:
        - asset: assets/fonts/CustomFont-Regular.ttf
        - asset: assets/fonts/CustomFont-Bold.ttf
          weight: 700
"""

    return pubspec_content


def _generate_flutter_main(params: TaskParameters) -> str:
    """Generate Flutter main.dart file"""

    return f"""/// {params.app_name} - Flutter App
/// Generated by Constella MobileFirstOps Agent

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'app/app.dart';
import 'app/bloc_observer.dart';
import 'core/injection/injection_container.dart' as di;

void main() async {{
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize dependencies
  await di.init();

  // Set up BLoC observer for debugging
  Bloc.observer = AppBlocObserver();

  runApp(const {params.app_name.replace(" ", "")}App());
}}

class {params.app_name.replace(" ", "")}App extends StatelessWidget {{
  const {params.app_name.replace(" ", "")}App({{super.key}});

  @override
  Widget build(BuildContext context) {{
    return MaterialApp.router(
      title: '{params.app_name}',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      routerConfig: AppRouter.router,
      debugShowCheckedModeBanner: false,
    );
  }}
}}
"""


# Helper functions for generating various components
def _generate_rn_components(params: TaskParameters) -> Dict[str, str]:
    return {
        "Button.js": "// Custom button component",
        "Input.js": "// Custom input component",
    }


def _generate_rn_screens(params: TaskParameters) -> Dict[str, str]:
    return {
        "HomeScreen.js": "// Home screen component",
        "ProfileScreen.js": "// Profile screen component",
    }


def _generate_rn_navigation(params: TaskParameters) -> Dict[str, str]:
    return {"AppNavigator.js": "// Navigation configuration"}


def _generate_rn_services(params: TaskParameters) -> Dict[str, str]:
    return {"api.js": "// API service layer", "auth.js": "// Authentication service"}


def _generate_rn_store(params: TaskParameters) -> Dict[str, str]:
    return {"index.js": "// Redux store configuration"}


def _generate_rn_utils(params: TaskParameters) -> Dict[str, str]:
    return {"helpers.js": "// Utility functions"}


def _generate_rn_hooks(params: TaskParameters) -> Dict[str, str]:
    return {"useAuth.js": "// Custom authentication hook"}


def _generate_rn_assets(params: TaskParameters) -> Dict[str, str]:
    return {"images/": "// Image assets", "fonts/": "// Font assets"}


def _generate_android_config(params: TaskParameters) -> Dict[str, str]:
    return {"build.gradle": "// Android build configuration"}


def _generate_ios_config(params: TaskParameters) -> Dict[str, str]:
    return {"Info.plist": "// iOS configuration"}


def _generate_metro_config(params: TaskParameters) -> str:
    return "// Metro bundler configuration"


def _generate_babel_config(params: TaskParameters) -> str:
    return "// Babel configuration"


def _generate_eslint_config(params: TaskParameters) -> str:
    return "// ESLint configuration"


def _generate_rn_readme(params: TaskParameters) -> str:
    return f"# {params.app_name}\n\nReact Native app generated by Constella MobileFirstOps Agent"


def _generate_rn_setup_instructions(params: TaskParameters) -> List[str]:
    return [
        "Install dependencies: npm install",
        "Run on iOS: npm run ios",
        "Run on Android: npm run android",
    ]


def _generate_rn_deployment_guide(params: TaskParameters) -> List[str]:
    return ["Build for production", "Configure app signing", "Submit to app stores"]


def _get_rn_performance_tips() -> List[str]:
    return [
        "Use FlatList for large lists",
        "Optimize images",
        "Use React.memo for components",
    ]


def _get_rn_best_practices() -> List[str]:
    return [
        "Follow React Native best practices",
        "Use TypeScript",
        "Implement proper error handling",
    ]


def _generate_flutter_app_structure(params: TaskParameters) -> Dict[str, str]:
    return {"app.dart": "// Main app widget"}


def _generate_flutter_features(params: TaskParameters) -> Dict[str, str]:
    return {"auth/": "// Authentication feature", "home/": "// Home feature"}


def _generate_flutter_shared(params: TaskParameters) -> Dict[str, str]:
    return {"widgets/": "// Shared widgets", "utils/": "// Shared utilities"}


def _generate_flutter_core(params: TaskParameters) -> Dict[str, str]:
    return {"injection/": "// Dependency injection", "router/": "// App routing"}


def _generate_flutter_android_config(params: TaskParameters) -> Dict[str, str]:
    return {"build.gradle": "// Android build configuration"}


def _generate_flutter_ios_config(params: TaskParameters) -> Dict[str, str]:
    return {"Info.plist": "// iOS configuration"}


def _generate_flutter_tests(params: TaskParameters) -> Dict[str, str]:
    return {"widget_test.dart": "// Widget tests"}


def _generate_flutter_assets(params: TaskParameters) -> Dict[str, str]:
    return {"images/": "// Image assets", "fonts/": "// Font assets"}


def _generate_flutter_readme(params: TaskParameters) -> str:
    return f"# {params.app_name}\n\nFlutter app generated by Constella MobileFirstOps Agent"


def _generate_flutter_setup_instructions(params: TaskParameters) -> List[str]:
    return ["Install dependencies: flutter pub get", "Run app: flutter run"]


def _generate_flutter_deployment_guide(params: TaskParameters) -> List[str]:
    return ["Build for production: flutter build apk", "Deploy to stores"]


def _get_flutter_performance_tips() -> List[str]:
    return ["Use const constructors", "Avoid rebuilds", "Optimize widgets"]


def _get_flutter_best_practices() -> List[str]:
    return [
        "Follow Flutter best practices",
        "Use proper state management",
        "Implement testing",
    ]


def _generate_rn_component_library(params: TaskParameters) -> Dict[str, str]:
    return {"components": "React Native component library"}


def _generate_flutter_component_library(params: TaskParameters) -> Dict[str, str]:
    return {"components": "Flutter widget library"}


def _generate_generic_component_patterns(params: TaskParameters) -> Dict[str, str]:
    return {"patterns": "Generic mobile component patterns"}


def _generate_design_tokens(params: TaskParameters) -> Dict[str, Any]:
    return {"colors": {"primary": "#007AFF"}, "typography": {"heading": "24px"}}


def _generate_theme_config(params: TaskParameters) -> Dict[str, Any]:
    return {"theme": "Theme configuration"}


def _get_accessibility_guidelines() -> List[str]:
    return [
        "Use semantic labels",
        "Ensure sufficient color contrast",
        "Support screen readers",
    ]


def _generate_component_tests(params: TaskParameters) -> Dict[str, str]:
    return {"tests": "Component testing strategies"}


def _generate_redux_setup(params: TaskParameters) -> Dict[str, str]:
    return {"store": "Redux store configuration"}


def _generate_zustand_setup(params: TaskParameters) -> Dict[str, str]:
    return {"store": "Zustand store configuration"}


def _generate_context_api_setup(params: TaskParameters) -> Dict[str, str]:
    return {"context": "React Context API setup"}


def _generate_bloc_setup(params: TaskParameters) -> Dict[str, str]:
    return {"bloc": "BLoC pattern setup"}


def _generate_provider_setup(params: TaskParameters) -> Dict[str, str]:
    return {"provider": "Provider pattern setup"}


def _generate_riverpod_setup(params: TaskParameters) -> Dict[str, str]:
    return {"riverpod": "Riverpod setup"}


def _generate_generic_state_patterns(params: TaskParameters) -> Dict[str, str]:
    return {"patterns": "Generic state management patterns"}


def _generate_data_flow_patterns(params: TaskParameters) -> Dict[str, str]:
    return {"patterns": "Data flow patterns"}


def _generate_caching_strategies(params: TaskParameters) -> Dict[str, str]:
    return {"strategies": "Caching strategies"}


def _generate_offline_sync_patterns(params: TaskParameters) -> Dict[str, str]:
    return {"patterns": "Offline synchronization patterns"}


# --- API Endpoints (ADR-012 Compliant) ---


@app.get("/health", response_model=HealthResponse)
async def health_check():
    try:
        llm = await get_llm()
        llm_ok = llm is not None and llm._initialized
        return HealthResponse(
            status="ok" if llm_ok else "degraded",
            details="LLM provider active" if llm_ok else "LLM provider not initialized",
            llm_configured=llm_ok,
            llm_cost_usd=llm.get_cost_today() if llm_ok else 0.0,
        )
    except Exception as e:
        return HealthResponse(
            status="degraded",
            details=f"LLM provider error: {str(e)}",
            llm_configured=False,
        )


@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()


@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
    start_time = time.time()

    try:
        if task.task_type == "create_react_native_app":
            result_data = await _create_react_native_app(task.parameters)
        elif task.task_type == "create_flutter_app":
            result_data = await _create_flutter_app(task.parameters)
        elif task.task_type == "generate_mobile_components":
            result_data = await _generate_mobile_components(task.parameters)
        elif task.task_type == "setup_state_management":
            result_data = await _setup_state_management(task.parameters)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported task type: {task.task_type}"
            )

        processing_time_ms = (time.time() - start_time) * 1000

        # Calculate metrics
        components_generated = len(result_data.get("components", {}))
        screens_created = len(result_data.get("screens", {}))
        native_modules = len(result_data.get("native_modules", {}))

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(
                processing_time_ms=processing_time_ms,
                components_generated=components_generated,
                screens_created=screens_created,
                native_modules=native_modules,
            ),
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {str(e)}"
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8016))  # Default port for mobilefirstops
    uvicorn.run(app, host="0.0.0.0", port=port)
