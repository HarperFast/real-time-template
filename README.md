# Harper Real-Time Application Template

This is a template for building [Harper](https://www.harper.fast/) real-time applications. You can download this repository as a starting point for building applications with Harper. To get started, make sure you have [installed Harper](https://docs.harper.fast/docs/install-harper), which can be quickly done with `npm install -g harper`. You can run your application from the directory where you downloaded the contents of this repository with:

`harper run /path/to/your-app`

(or if you enter that directory, you can run the current directory as `harper run .`).

For more information about getting started with Harper and building applications, see our getting started guide.

This template includes the [default configuration](./config.yaml), which specifies how files are handled in your application.

The [schema.graphql](./schema.graphql) is the schema definition. This is the main starting point for defining your database schema, specifying which tables you want and what attributes/fields they should have.

The [resources.js](./resources.js) provides a template for defining JavaScript resource classes, for customized application logic in your endpoints.
