from setuptools import setup

setup(
    name="llm-provider",
    version="0.1.0",
    description="Shared LLM provider package for Constella AI Platform",
    author="Constella AI",
    py_modules=["llm_provider"],
    install_requires=[
        "httpx>=0.25.0,<1.0.0",
        "redis>=5.0.0,<6.0.0",
    ],
    python_requires=">=3.11",
)
